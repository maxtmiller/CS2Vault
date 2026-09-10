import SteamUser from 'steam-user';
import GlobalOffensive from 'globaloffensive';
import CRC32 from 'crc-32';
import protobuf from 'protobufjs';
import path from 'path';
import { fetchData, getFullItemData, getFullPriceData, getFullSkinData } from "@/lib/data-loader";
import { getWearName, buildPriceTitle, buildCSFloatUrl, buildSteamMarketUrl } from './itemDataHelpers.js';


let full_item_data;
let full_price_data;
let full_skin_data;

const skinByWeaponPaint = new Map();
const itemByDefIndex = new Map();
const crateByDefIndex = new Map();
const stickerById = new Map();
const keychainById = new Map();


function buildIndexes() {
    for (const skin of Object.values(full_skin_data)) {
        skinByWeaponPaint.set(`${skin.weapon.weapon_id}:${skin.paint_index ?? 0}`, skin);
    }

    for (const [key, item] of Object.entries(full_item_data)) {
        if (key.startsWith('sticker-')) {
            stickerById.set(Number(key.split('-')[1]), item);
        } else if (key.startsWith('keychain-')) {
            keychainById.set(Number(key.split('-')[1]), item);
        } else if (key.startsWith('crate-')) {
            crateByDefIndex.set(Number(key.split('-')[1]), item);
        } else if (item.def_index != null && !key.startsWith('sticker_slab')) {
            itemByDefIndex.set(Number(key.split('-')[1]), item);
        }
    }
}


let CEconItemPreviewDataBlock;

async function initProto() {
    const filePath = path.join(process.cwd(), 'public/econ.proto');
    const root = await protobuf.load(filePath);
    CEconItemPreviewDataBlock = root.lookupType('CEconItemPreviewDataBlock');
}


async function generateInspectLinkFromObject(props) {
    const previewLink = 'steam://rungame/730/76561202255233023/+csgo_econ_action_preview%20';

    const floatArray = new Float32Array(1);
    floatArray[0] = props.paint_wear;
    const paintwear = new Uint32Array(floatArray.buffer)[0];

    const econ = {
        defindex: props.def_index,
        paintindex: props.paint_index,
        paintseed: props.paint_seed,
        rarity: props.rarity,
        paintwear,
        customname: props.custom_name || '',
        stickers: (props.stickers || []).map(s => ({
            ...s,
            stickerId: s.sticker_id,
            offsetX: s.offset_x ?? 0,
            offsetY: s.offset_y ?? 0,
            rotation: s.rotation ?? 0,
        })),
    };

    const errMsg = CEconItemPreviewDataBlock.verify(econ);
    if (errMsg) throw new Error(errMsg);

    let payload = CEconItemPreviewDataBlock.encode(econ).finish();
    payload = Buffer.concat([Uint8Array.from([0]), payload]);

    const crc = CRC32.buf(payload);
    const x_crc = (crc & 0xffff) ^ (CEconItemPreviewDataBlock.encode(econ).finish().length * crc);

    const crcBuffer = Buffer.alloc(4);
    crcBuffer.writeUInt32BE((x_crc & 0xffffffff) >>> 0, 0);

    const hex = Buffer.concat([payload, crcBuffer]).toString('hex').toUpperCase();
    return `${previewLink}${hex}`;
}


async function mergeData(items) {
    try {
        const groupedItems = new Map();

        for (const item of items) {
            const hasPaintIndex = Object.prototype.hasOwnProperty.call(item, 'paint_index');
            const hasStickerId = Object.prototype.hasOwnProperty.call(item, 'sticker_id');
            const itemQty = Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 1;

            let key;
            if (item.def_index === 1355) {
                key = `charm-${item.def_index}-${item.keychain_index}`;
            } else if (!hasPaintIndex && !hasStickerId) {
                key = `no-paint-no-sticker-${item.def_index}`;
            } else if (!hasPaintIndex && hasStickerId) {
                key = `no-paint-with-sticker-${item.def_index}-${item.sticker_id}`;
            } else {
                key = `other-${item.def_index}-${item.paint_index ?? 0}-${item.paint_seed ?? 0}-${item.paint_wear ?? 0}`;
            }

            if (groupedItems.has(key)) {
                groupedItems.get(key).quantity += itemQty;
            } else {
                groupedItems.set(key, { ...item, quantity: itemQty });
            }
        }

        console.log('Merged items saved');
        return Array.from(groupedItems.values());
    } catch (error) {
        console.error('Error processing items:', error);
    }
}


async function getStickers(data) {
    if (!data.stickers?.length) return data;

    data.stickers = data.stickers.reduce((acc, item) => {
        const sticker = stickerById.get(item.sticker_id);
        if (sticker) {
            acc.push({
                ...item,
                name: sticker.name,
                image: sticker.image,
                steam_price: full_price_data[sticker.name]?.steam.last_ever ?? null,
            });
        }
        return acc;
    }, []);

    return data;
}


function lookupItem(data) {
    if ('paint_wear' in data) return skinByWeaponPaint.get(`${data.def_index}:${data.paint_index}`);
    if (data.sticker_id) return stickerById.get(data.sticker_id);
    if ('keychain_index' in data) return keychainById.get(data.keychain_index);
    if (data.rarity == 1) return crateByDefIndex.get(data.def_index);
    return itemByDefIndex.get(data.def_index);
}


function resolveCategory(item, customType) {
    if (!item.type) {
        if (item.category) return 'weapon';
        if (item.name.split(' ')[0] === 'Charm') {
            item.type = 'Keychain';
            return 'charm';
        }
        return customType;
    }
    if (item.name.split(' ')[0] === 'Sticker') return 'sticker';
    if (item.type === 'Sticker Capsule' || item.type === 'Autograph Capsule' || item.type === 'Case') return 'container';
    return item.type;
}


async function getVanillaKnifeData(item, data) {
    data.paint_index = 0;
    const title = data.is_stattrak ? `StatTrak™ ${item.name}` : item.name;
    const price = full_price_data[title];
    const csFloatCategory = data.is_stattrak ? 2 : 1;

    return {
        name: `${item.name} | Vanilla`,
        rarity_name: 'Covert',
        type: 'Knives',
        category: 'weapon',
        csfloat: `https://csfloat.com/search?sort_by=lowest_price&category=${csFloatCategory}&def_index=${data.def_index}&paint_index=0`,
        steam: `https://steamcommunity.com/market/listings/730/${encodeURIComponent(title)}`,
        icon_url: item.image,
        inspect_link: await generateInspectLinkFromObject(data),
        steam_price: price?.steam.last_ever ?? null,
    };
}


async function getItemInfoByDefIndex(data) {
    if (data.def_index === 1201 || (data.def_index === 36 && data.paint_index === 125)) return null;

    // Vanilla knife: knife def_index with no paint applied
    if (data.def_index >= 500 && data.def_index <= 550 && !('paint_wear' in data) && !('paint_index' in data)) {
        const item = skinByWeaponPaint.get(`${data.def_index}:0`);
        return item ? getVanillaKnifeData(item, data) : null;
    }

    const item = lookupItem(data);
    if (!item || ('genuine' in item && !item.market_hash_name)) return null;

    const customType = item.id.split('-')[0].replace(/^./, c => c.toUpperCase());
    const price = full_price_data[buildPriceTitle(item, data)];
    const category = resolveCategory(item, customType);
    const inspect_link = 'paint_wear' in data ? await generateInspectLinkFromObject(data) : null;

    return {
        name: item.name,
        rarity_name: item.rarity?.name ?? 'Base Grade',
        type: item.type ?? item.category?.name ?? customType,
        category,
        csfloat: buildCSFloatUrl(data),
        quantity: data.quantity || 1,
        steam: buildSteamMarketUrl(item, data),
        icon_url: item.image,
        inspect_link,
        steam_price: price?.steam.last_ever ?? null,
        is_tradable: data.is_tradable,
    };
}


async function appendInfo(mergedData) {
    try {
        const items = mergedData;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];

            if (!item || (item.def_index === 4001 && item.quantity === 1) || item.origin == 9) {
                items.splice(i--, 1);
                continue;
            }

            await getStickers(item);
            const new_data = await getItemInfoByDefIndex(item);

            if (new_data) {
                Object.assign(item, new_data);
            } else {
                items.splice(i--, 1);
            }
        }

        console.log('Item info appended');
        return items;
    } catch (error) {
        console.error('Error processing items: ', error);
    }
}


export async function initializeCSGOInventory(authData, loginType) {
    return new Promise((resolve, reject) => {
        const items_data = [];
        const storage_units = [];
        const client = new SteamUser();
        const csgo = new GlobalOffensive(client);

        client.setMaxListeners(30);
        csgo.setMaxListeners(30);

        let steamID;
        let settled = false;

        function cleanup(logOff = true) {
            if (logOff) {
                try { client.logOff(); } catch (_) {}
            }
            client.removeAllListeners();
            csgo.removeAllListeners();
        }

        function settle(fn) {
            if (settled) return;
            settled = true;
            clearTimeout(gcTimeout);
            fn();
        }

        // Fail hard if GC never connects within 60s
        const gcTimeout = setTimeout(() => {
            console.error('[GC] Timed out waiting for connectedToGC after 60s');
            settle(() => {
                cleanup();
                reject({ success: false, details: 'Timed out waiting for CS2 Game Coordinator connection.', item_data: [], steamID: null, storage_units: [] });
            });
        }, 60000);

        function handleLoggedOn() {
            console.log('[AUTH] Logged into Steam. SteamID:', client.steamID?.getSteamID64());
            console.log('[AUTH] Calling gamesPlayed([730]) to launch CS2...');
            client.gamesPlayed([730]);
            steamID = client.steamID.getSteamID64();
            console.log('[AUTH] gamesPlayed sent. Waiting for connectedToGC...');
        }

        client.on('steamGuard', (domain, callback, lastCodeWrong) => {
            console.log('[AUTH] Steam Guard requested. domain:', domain, 'lastCodeWrong:', lastCodeWrong);
        });

        client.on('loginKey', (key) => {
            console.log('[AUTH] Login key received.');
        });

        client.on('webSession', (sessionID, cookies) => {
            console.log('[AUTH] Web session established. sessionID:', sessionID);
        });

        client.on('disconnected', (eresult, msg) => {
            console.log('[CLIENT] Disconnected. eresult:', eresult, 'msg:', msg);
        });

        client.on('appOwnershipCached', () => {
            console.log('[CLIENT] App ownership cached.');
        });

        client.on('receivedFromGC', (appid, msgType, payload) => {
            console.log('[GC] receivedFromGC appid:', appid, 'msgType:', msgType, 'payloadLen:', payload?.length);
            // 4009 = ClientConnectionStatus — log the raw payload to see rejection reason
            if (msgType === 4009) {
                console.log('[GC] ClientConnectionStatus payload (hex):', payload?.toString('hex'));
            }
        });

        csgo.on('disconnectedFromGC', (reason) => {
            console.log('[GC] Disconnected from GC. reason:', reason);
        });

        if (loginType === 1) {
            console.log('[AUTH] QR Code Flow — using refreshToken');
            client.logOn({ refreshToken: authData.refreshToken });
            client.once('loggedOn', handleLoggedOn);
        } else {
            console.log('[AUTH] JWT Flow — account:', authData.account_name, 'steamid:', authData.steamid);
            console.log('[AUTH] Token prefix:', authData.token?.substring(0, 20));
            client.logOn({
                accountName: authData.account_name,
                webLogonToken: authData.token,
                steamID: authData.steamid,
            });
            client.once('loggedOn', () => {
                console.log('[AUTH] loggedOn fired for JWT flow');
                handleLoggedOn();
                client.setPersona(SteamUser.EPersonaState.Online);
            });
        }

        csgo.once('connectedToGC', async () => {
            console.log('[GC] Connected to CS2 Game Coordinator.');
            try {
                await fetchData();
                full_item_data = getFullItemData();
                full_price_data = getFullPriceData();
                full_skin_data = getFullSkinData();
                buildIndexes();
                await initProto();

                if (!csgo.inventory) throw new Error('Inventory not available.');

                const cleanedInventory = csgo.inventory
                    .filter(item => !item.casket_id)
                    .map(item => mapInventoryItem(item, 'Inventory'));

                const normalItems = [];
                for (const item of cleanedInventory) {
                    if (item.casket_contained_item_count) {
                        try {
                            items_data.push(await getCasketItems(csgo, item));
                            storage_units.push({ name: item.custom_name, count: item.casket_contained_item_count });
                        } catch (err) {
                            console.error('Failed to load casket:', item.id, err.message);
                        }
                    } else {
                        normalItems.push(item);
                    }
                }

                console.log('[GC] Casket items loaded.');
                items_data.push(normalItems);
                console.log('[GC] Inventory data saved.');

                let mergedData = await mergeData(items_data.flat());
                mergedData = await appendInfo(mergedData);
                console.log('[GC] Data merged and appended.');

                settle(() => {
                    cleanup();
                    resolve({ success: true, item_data: JSON.stringify(mergedData, null, 2), steamID, storage_units });
                });

            } catch (err) {
                console.error('[GC] Error processing inventory:', err);
                settle(() => {
                    cleanup();
                    reject(err);
                });
            }
        });

        client.once('error', (err) => {
            console.error('[CLIENT] Steam error event:', err.message, '| eresult:', err.eresult, '| full:', err);

            let error_details = '';
            if (err.message === 'AccessDenied') {
                error_details = 'Invalid JWT token. Please try generating a new one.';
            } else if (err.message === 'InvalidPassword') {
                error_details = 'Too many API requests. Please try again later.';
            } else if (err.message === 'LoggedInElsewhere') {
                error_details = 'Your Steam account is logged in elsewhere. Please log out from other devices and try again.';
            }

            settle(() => {
                cleanup(false);
                reject({ success: false, details: error_details, item_data: [], steamID: null, storage_units: [] });
            });
        });
    });
}


function mapInventoryItem(item, location) {
    const {
        def_index, stickers, paint_wear, attribute, position, level, custom_desc, quality,
        original_id, interior_item, style, in_use, equipped_state, kill_eater_score_type, kill_eater_value,
        ...rest
    } = item;

    if (def_index === 7 && paint_wear === 0.23264546692371) console.log('Found special item:', item);

    const is_tradable = item.tradable_after 
        ? new Date(item.tradable_after) <= new Date() 
        : true;

    if (def_index === 1355) {
        let value;
        try {
            const buffer = Buffer.from(attribute.find(attr => attr.def_index === 299).value_bytes);
            value = buffer.readUInt32LE(0);
        } catch (error) {
            console.log(error);
        }
        return { def_index, ...rest, quantity: 1, keychain_index: value || 3, location, is_tradable };
    }

    if (def_index === 1209 && Array.isArray(stickers) && stickers.length > 0) {
        return { def_index, quantity: 1, sticker_id: stickers[0].sticker_id, ...rest, quality, location, is_tradable };
    }

    if (paint_wear) {
        const wear_name = getWearName(paint_wear);
        const is_stattrak = kill_eater_score_type === 0;
        const is_souvenir = !is_stattrak && quality === 12;
        return {
            def_index, ...rest, quantity: 1, quality, paint_wear, wear_name,
            ...(is_stattrak || is_souvenir ? { sttattrak_count: kill_eater_value } : {}),
            stickers, is_stattrak, is_souvenir, location, is_tradable,
        };
    }

    return { def_index, ...rest, quantity: 1, quality, location, is_tradable };
}


async function getCasketItems(csgo, item) {
    return new Promise((resolve, reject) => {
        csgo.getCasketContents(item.id, (err, items) => {
            if (err) reject(new Error('Error fetching casket contents: ' + err));
            else resolve(items.map(i => mapInventoryItem(i, item.custom_name)));
        });
    });
}
