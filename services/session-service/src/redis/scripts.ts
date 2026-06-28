export const LUA_RESERVE = `
-- KEYS:
-- 1) chargerReservationKey
-- 2) userReservationKey
-- 3) chargerStatusKey
--
-- ARGV:
-- 1) userId
-- 2) chargerId
-- 3) ttlMs
-- 4) nowMs

local chargerResKey = KEYS[1]
local userResKey    = KEYS[2]
local statusKey     = KEYS[3]

local userId   = ARGV[1]
local chargerId = ARGV[2]
local ttlMs    = tonumber(ARGV[3])
local nowMs    = tonumber(ARGV[4])

if redis.call("EXISTS", userResKey) == 1 then
  return { err = "USER_ALREADY_HAS_RESERVATION" }
end

if redis.call("EXISTS", chargerResKey) == 1 then
  return { err = "CHARGER_ALREADY_RESERVED" }
end

local expiresAtMs = nowMs + ttlMs
local payload = cjson.encode({
  userId = userId,
  chargerId = chargerId,
  expiresAtMs = expiresAtMs
})

redis.call("SET", chargerResKey, payload, "PX", ttlMs)
redis.call("SET", userResKey, chargerId, "PX", ttlMs)

-- Mark charger in_use while reserved (TTL matches)
redis.call("SET", statusKey, "in_use", "PX", ttlMs)

return { "OK", tostring(expiresAtMs) }
`;
