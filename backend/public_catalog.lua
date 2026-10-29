local http = require("http")
local fs = require("fs")
local utils = require("utils")
local millennium = require("millennium")
local catalog = {}

local function app_id(value)
    local id = tonumber(value)
    if not id or id < 1 or id >= 2147483648 or id % 1 ~= 0 then error("Invalid Steam app ID") end
    return string.format("%.0f", id)
end

local function request(url, options, limit)
    options = options or {}
    options.timeout = 15
    options.follow_redirects = false
    options.verify_ssl = true
    options.user_agent = "TrophyStyles/1.0.0"
    local response, reason = http.request(url, options)
    local host = url:match("^https://([^/]+)") or "public catalog"
    if not response then error(host .. ": " .. tostring(reason)) end
    if response.status ~= 200 then error(host .. " returned HTTP " .. tostring(response.status)) end
    if #response.body > limit then error("Public catalog response is too large") end
    return response.body
end

function catalog.steam_page(appid)
    return request("https://steamcommunity.com/achievements/" .. app_id(appid) .. "?l=english", nil, 6000000)
end

function catalog.steam_percentages(appid)
    return request("https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=" .. app_id(appid), nil, 2000000)
end

function catalog.search(query)
    if type(query) ~= "string" or #query < 2 or #query > 200 then error("Invalid game search") end
    return request("https://psntrophyleaders.com/game/autocomplete", {
        method = "POST",
        data = "search_char=" .. utils.url_encode(query),
        headers = { ["Content-Type"] = "application/x-www-form-urlencoded" },
    }, 2000000)
end

function catalog.page(slug, trophy_id)
    if type(slug) ~= "string" or #slug > 180 or not slug:match("^[a-z0-9][a-z0-9%-]+$") then error("Invalid PS5 game slug") end
    local path = "/game/view/" .. slug
    if trophy_id ~= "" then
        if type(trophy_id) ~= "string" or not trophy_id:match("^%d+$") or #trophy_id > 10 then error("Invalid trophy ID") end
        path = path .. "/" .. trophy_id
    end
    return request("https://psntrophyleaders.com" .. path, nil, 6000000)
end

function catalog.icon(url)
    if type(url) ~= "string" or #url > 250 or not url:match("^https://np%.sentl%.com/images/games/[a-zA-Z0-9/_.%-]+$") then error("Invalid trophy image URL") end
    if type(http.download) ~= "function" then return url end
    local folder = millennium.steam_path() .. "/millennium/cache/trophy-styles/icons"
    local filename = url:match("/images/games/(.+)$"):gsub("/", "_")
    local path = folder .. "/icon_" .. filename
    local bytes = utils.read_file(path)
    if not bytes then
        local created = fs.create_directories(folder)
        if created == nil then error("Could not create trophy image cache") end
        -- HTTP response bodies cross JSON IPC and cannot safely carry PNG bytes.
        local response, reason = http.download(url, path, { timeout = 15, follow_redirects = false, verify_ssl = true, user_agent = "TrophyStyles/1.0.0" })
        if not response or not response.success or response.status ~= 200 or response.bytes_written > 2000000 then
            fs.remove(path)
            error("Could not download trophy image: " .. tostring(reason or (response and response.status)))
        end
        bytes = utils.read_file(path)
    end
    if not bytes or #bytes > 2000000 then fs.remove(path) error("Invalid trophy image size") end
    local mime
    if bytes:sub(1, 8) == "\137PNG\r\n\26\n" then mime = "image/png"
    elseif bytes:sub(1, 3) == "\255\216\255" then mime = "image/jpeg"
    elseif bytes:sub(1, 4) == "RIFF" and bytes:sub(9, 12) == "WEBP" then mime = "image/webp"
    else fs.remove(path) error("Unsupported trophy image format") end
    return "data:" .. mime .. ";base64," .. utils.base64_encode(bytes)
end

local function cache_path(appid, prefix)
    local folder = millennium.steam_path() .. "/millennium/cache/trophy-styles"
    return folder .. "/" .. (prefix or "") .. app_id(appid) .. ".json", folder
end

function catalog.read_cache(appid, prefix)
    local path = cache_path(appid, prefix)
    local content = utils.read_file(path)
    if not content or #content > 2000000 then return "" end
    return content
end

function catalog.write_cache(appid, content, prefix)
    if type(content) ~= "string" or #content > 2000000 then error("Invalid trophy cache") end
    local path, folder = cache_path(appid, prefix)
    local created, reason = fs.create_directories(folder)
    if created == nil then error("Could not create trophy cache: " .. tostring(reason)) end
    local written, write_error = utils.write_file(path, content)
    if not written then error("Could not save trophy cache: " .. tostring(write_error)) end
    return true
end

function catalog.xbox_search(query)
    if type(query) ~= "string" or #query < 2 or #query > 200 then error("Invalid Xbox game search") end
    return request("https://xct.live/api/v1/store/products?q=" .. utils.url_encode(query) .. "&per_page=25&lite=1", nil, 6000000)
end

function catalog.xbox_achievements(title_id)
    if type(title_id) ~= "string" or #title_id > 10 or not title_id:match("^%d+$") then error("Invalid Xbox title ID") end
    return request("https://xct.live/api/v1/store/title-achievements/" .. title_id, nil, 6000000)
end

return catalog
