local millennium = require("millennium")
local utils = require("utils")
local public_catalog = require("public_catalog")

local function completion_key(steam_id, appid)
    if type(steam_id) ~= "string" or not steam_id:match("^%d+$") or #steam_id ~= 17 then error("Invalid Steam user") end
    if type(appid) ~= "number" or appid < 1 or appid >= 2147483648 or appid % 1 ~= 0 then error("Invalid Steam app") end
    return "completion_platinum_" .. steam_id .. "_" .. string.format("%.0f", appid)
end

---@ffi
---@param steamId string
---@param appid number
---@return boolean
function hasCompletionPlatinum(steamId, appid)
    return millennium.config.get(completion_key(steamId, appid)) == true
end

---@ffi
---@param steamId string
---@param appid number
---@return boolean
function claimCompletionPlatinum(steamId, appid)
    local key = completion_key(steamId, appid)
    if millennium.config.get(key) == true then return false end
    if not millennium.config.set(key, true) then error("Could not save completion platinum") end
    return true
end

---@ffi
---@param steamId string
---@param appid number
---@return boolean
function releaseCompletionPlatinum(steamId, appid)
    return millennium.config.delete(completion_key(steamId, appid))
end

---@ffi
---@param appid number
---@return string
function getPublicSteamAchievements(appid)
    return public_catalog.steam_page(appid)
end

---@ffi
---@param appid number
---@return string
function getGlobalSteamAchievementPercentages(appid)
    return public_catalog.steam_percentages(appid)
end

---@ffi
---@param query string
---@return string
function searchPublicPs5Games(query)
    return public_catalog.search(query)
end

---@ffi
---@param slug string
---@param trophyId string
---@return string
function getPublicPs5Page(slug, trophyId)
    return public_catalog.page(slug, trophyId)
end

---@ffi
---@param url string
---@return string
function getPublicPs5Icon(url)
    return public_catalog.icon(url)
end

---@ffi
---@param appid number
---@return string
function readPublicPs5Cache(appid)
    return public_catalog.read_cache(appid)
end

---@ffi
---@param appid number
---@param content string
---@return boolean
function writePublicPs5Cache(appid, content)
    return public_catalog.write_cache(appid, content)
end

---@ffi
---@return string
function getTrophySoundUri()
    return "data:application/gzip;base64," .. utils.base64_encode(millennium.assets.read("resources/packed/ps5-trophy.wav.gz"))
end

---@ffi
---@return string
function getPlatinumSoundUri()
    return "data:application/gzip;base64," .. utils.base64_encode(millennium.assets.read("resources/packed/ps5-platinum.wav.gz"))
end

---@ffi
---@return string
function getPs4TrophySoundUri()
    return "data:application/gzip;base64," .. utils.base64_encode(millennium.assets.read("resources/packed/ps4-trophy.wav.gz"))
end

---@ffi
---@param query string
---@return string
function searchPublicXboxGames(query)
    return public_catalog.xbox_search(query)
end

---@ffi
---@param titleId string
---@return string
function getPublicXboxAchievements(titleId)
    return public_catalog.xbox_achievements(titleId)
end

---@ffi
---@param appid number
---@return string
function readPublicXboxCache(appid)
    return public_catalog.read_cache(appid, "xbox_")
end

---@ffi
---@param appid number
---@param content string
---@return boolean
function writePublicXboxCache(appid, content)
    return public_catalog.write_cache(appid, content, "xbox_")
end

---@ffi
---@param variant string
---@return string
function getXboxSoundUri(variant)
    local files = { normal = "normal", rare = "rare", mythic = "mythic" }
    if not files[variant] then error("Invalid Xbox sound") end
    return "data:application/gzip;base64," .. utils.base64_encode(millennium.assets.read("resources/packed/xbox/" .. files[variant] .. ".wav.gz"))
end

---@ffi
---@param steamId string
---@param appid number
---@return boolean
function hasCompletionMythic(steamId, appid)
    return millennium.config.get("xbox_" .. completion_key(steamId, appid)) == true
end

---@ffi
---@param steamId string
---@param appid number
---@return boolean
function claimCompletionMythic(steamId, appid)
    local key = "xbox_" .. completion_key(steamId, appid)
    if millennium.config.get(key) == true then return false end
    if not millennium.config.set(key, true) then error("Could not save completion Mythic") end
    return true
end

---@ffi
---@param steamId string
---@param appid number
---@return boolean
function releaseCompletionMythic(steamId, appid)
    return millennium.config.delete("xbox_" .. completion_key(steamId, appid))
end

return {
    on_load = function()
        if millennium.config.get("matchPlayStation") == nil then
            millennium.config.set("matchPlayStation", true)
        end
        if millennium.config.get("enabled") == nil then
            millennium.config.set("enabled", true)
        end
        if millennium.config.get("notificationStyle") == nil then
            millennium.config.set("notificationStyle", "ps5")
        end
        if millennium.config.get("xboxColor") == nil then
            millennium.config.set("xboxColor", "#107c10")
        end
        if millennium.config.get("completionPlatinum") == nil then
            millennium.config.set("completionPlatinum", true)
        end
        if millennium.config.get("subtitleMode") == nil then
            millennium.config.set("subtitleMode", "description")
        end
        if millennium.config.get("raritySource") == nil then
            millennium.config.set("raritySource", "steam")
        end
        if millennium.config.get("language") == nil then
            millennium.config.set("language", "auto")
        end
        if millennium.config.get("popupCorner") == nil then
            millennium.config.set("popupCorner", "top-right")
        end
        if millennium.config.get("popupDuration") == nil then
            millennium.config.set("popupDuration", "auto")
        end
        if millennium.config.get("gameProfiles") == nil then
            millennium.config.set("gameProfiles", "{}")
        end
        if millennium.config.get("showProgress") == nil then
            millennium.config.set("showProgress", false)
        end
        if millennium.config.get("soundVolume") == nil then
            millennium.config.set("soundVolume", 100)
        end
        millennium.ready()
    end,
    -- Millennium 3.6.2 writes the registry into a 4 KiB pipe before spawning its reader.
    patches = {
        {
            file = [[sp\.js]],
            find = [[,\w+=!!\w+,\w+=\(0,\w+\.hi\)\(\w+\);]],
            transforms = {
                {
                    match = [[(,\w+=!!(\w+),(\w+)=\(0,\w+\.hi\)\(\w+\);)]],
                    replace = [[\1 #{{self}}?.notification?.setOverlayMonitor?.(\2,\3);]],
                },
            },
        },
        {
            file = [[sp\.js]],
            find = [[function \w+\(\w+,\w+,\w+,\w+\)\{console\.assert\(\w+!==void 0\);let[\s\S]*?\w+=\w+&&\w+\.length<\w+,\w+=\w+\(\w+,\w+,\w+\)]],
            transforms = {
                {
                    match = [[(\w+=\w+&&)(\w+)(\.length<\w+),(\w+=\w+\(\w+,\w+,\w+\))]],
                    replace = [[\1\2\3&&!#{{self}}?.notification?.queueBlocked?.(\2),\4]],
                },
            },
        },
        {
            file = [[sp\.js]],
            find = [[async TestAchievement\(\w+,\w+=!1\)\{[\s\S]*?this\.OnNotification\(this\.m_nNextTestNotificationID\+\+,[\s\S]*?\.serializeBinary\(\)\)\}]],
            transforms = {
                {
                    match = [[async TestAchievement\((\w+),(\w+)=!1\)\{([\s\S]*?let \w+=)(\w+\.\w+)(\.fromObject\(\w+\);this\.OnNotification\(this\.m_nNextTestNotificationID\+\+,)(\w+\.\w+\.\w+)(,\w+\.serializeBinary\(\)\)\})]],
                    replace = [[async TestAchievement(\1,\2=!1,trophy){if(trophy){const testTrophy=\4.fromObject(trophy);this.OnNotification(this.m_nNextTestNotificationID++,\6,testTrophy.serializeBinary());return}\3\4\5\6\7]],
                },
            },
        },
        {
            file = [[sp\.js]],
            find = [[ProcessNotification\(\w+,\w+,\w+\)\{if\(]],
            transforms = {
                {
                    match = [[ProcessNotification\((\w+),(\w+),(\w+)\)\{]],
                    replace = [[ProcessNotification(\1,\2,\3){#{{self}}?.notification?.prepareNotification?.(\2);]],
                },
            },
        },
        {
            file = [[sp\.js]],
            find = [[function \w+\(\w+\)\{return \w+\[\w+\.eType\]\.displayToastAlone===!0\}]],
            transforms = {
                {
                    match = [[function (\w+)\((\w+)\)\{return ([\s\S]*?)\}]],
                    replace = [[function \1(\2){return #{{self}}?.notification?.displayAlone?.(\2)??(\3)}]],
                },
            },
        },
        {
            file = [[sp\.js]],
            find = [[PlayNotificationSound\(\w+\)\{[^}]+\}]],
            transforms = {
                {
                    match = [[PlayNotificationSound\((\w+)\)\{([\s\S]*?;)(\w+)&&([\s\S]*)\}]],
                    replace = [[PlayNotificationSound(\1){#{{self}}?.notification?.beginNotification?.(\1);\2 if(\3){const nativeSound=()=>{\4};if(!#{{self}}?.notification?.playNotificationSound?.(\1,nativeSound))nativeSound()}}]],
                },
            },
        },
        {
            file = [[sp\.js]],
            find = [[function \w+\(\w+\)\{let\{location:\w+\}=\w+,\w+=\w+\(\w+\.group\),\w+=\w+\.data\.appid\(\),[\s\S]*?achievement_id\(\)[\s\S]*?fullWidth:\w+,onActivate:\w+,onDismiss:\w+\.onDismiss\}\)]],
            transforms = {
                {
                    match = [[function (\w+)\((\w+)\)(\{let\{location:[\s\S]*?return\(0,(\w+\.jsx)\))]],
                    replace = [[function \1(\2){return(0,\4)(#{{self}}?.notification?.AchievementToast||TrophyNative_\1,{...\2,nativeToast:TrophyNative_\1})}function TrophyNative_\1(\2)\3]],
                },
            },
        },
        {
            file = [[sp\.js]],
            find = [[function \w+\(\w+\)\{let\{appid:\w+,notification:[\s\S]*?\.DesktopToastContainer]],
            transforms = {
                {
                    match = [[(function \w+\(\w+\)\{let\{appid:(\w+),[\s\S]*?)(\w+)(\.notificationID[\s\S]*?dimensions:\{width:)(\w+),height:(\w+)(\},body_class:)(\w+\(\)\.DesktopToastContainer)]],
                    replace = [[\1\3\4(#{{self}}?.notification?.desktopSize?.(\3,\2)?.width??\5),height:(#{{self}}?.notification?.desktopSize?.(\3,\2)?.height??\6)\7(\8+(#{{self}}?.notification?.desktopSize?.(\3,\2)?" trophy-styles-notification-window":""))]],
                },
            },
        },
        {
            file = [[sp\.js]],
            find = [[let \w+=\(0,\w+\.xW\)\(\w+\),\w+=\{m_notification:\w+,m_popup:\w+,m_nToastHeight:\w+]],
            transforms = {
                {
                    match = [[let (\w+)=\(0,(\w+\.xW)\)\((\w+)\)]],
                    replace = [[let \1=#{{self}}?.notification?.desktopSize?.(\3)?.height??(0,\2)(\3)]],
                },
            },
        },
        {
            file = [[sp\.js]],
            find = [[for\(let \w+ of \w+\)\{let \w+=Math.floor\(\w+\.toast\.m_nToastHeight[\s\S]*?\.m_popup\.SteamClient\.Window\.MoveTo\(\w+,\w+,\w+\.m_flDPI\)]],
            transforms = {
                {
                    match = [[for\(let (\w+) of (\w+)\)(\{let [\s\S]*?)(\((\w+)!==\w+\.toast\.m_nLastX\|\|(\w+)!==\w+\.toast\.m_nLastY\)[\s\S]*?\.MoveTo\(\w+,\w+,(\w+)\.m_flDPI\))]],
                    replace = [[for(let \1 of \2)\3 const trophyPosition=#{{self}}?.notification?.desktopPosition?.(\1.toast.m_notification,\7,\1.flPercentDone,\2);if(trophyPosition){\5=trophyPosition.left;\6=trophyPosition.top}\4]],
                },
            },
        },
    },
}
