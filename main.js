const st = require("./soundtouch"),
    path = require("path"),
    speakers = JSON.parse(require("fs").readFileSync(path.join(__dirname, "conf.json"), 'utf8'))

/**
 * @typedef {"PLAY"|"PAUSE"|"STOP"|"PREV_TRACK"|"NEXT_TRACK"|"THUMBS_UP"|"THUMBS_DOWN"|"BOOKMARK"|"POWER"|"MUTE"|"VOLUME_UP"|"VOLUME_DOWN"|"PRESET_1"|"PRESET_2"|"PRESET_3"|"PRESET_4"|"PRESET_5"|"PRESET_6"|"AUX_INPUT"|"SHUFFLE_OFF"|"SHUFFLE_ON"|"REPEAT_OFF"|"REPEAT_ONE"|"REPEAT_ALL"|"PLAY_PAUSE"|"ADD_FAVORITE"|"REMOVE_FAVORITE"} key
 */
/**
 * @callback cbFunc
 * @param {Error|null} err - error if applicable
 * @param {object} res - the response object if no error
 */

/**
 * "press" a key on the speaker
 * @param {string} speakerid - the speaker to send the command to
 * @param {key} key - the key to press
 * @param {cbFunc} cb - any errors or information once the request is completed
 */
function key(speakerid, key, cb) {
    st.send({
        'speaker': speakers[speakerid], 'path': "key", 'post': {
            key: {
                $: {
                    "state": "press",
                    sender: "Gabbo"
                },
                _: key
            }
        }
    }, (err, res) => {
        if (err) return cb(err, res)
        st.send({
            'speaker': speakers[speakerid], 'path': "key", 'post': {
                key: {
                    $: {
                        "state": "release",
                        sender: "Gabbo"
                    },
                    _: key
                }
            }
        }, (...args) => rescb(cb, args))
    })
}
function seek(speakerid, startSecond, cb) {
    st.send({ 'speaker': speakers[speakerid], 'path': 'userTrackControl', 'post': { TrackControl: { $: { startSecond }, _: "SEEK_TO_TIME" } } }, (...args) => rescb(cb, args))
}
function select(speakerid, contentItem, cb) {
    st.send({ 'speaker': speakers[speakerid], 'path': 'select', 'post': contentItem }, (...args) => rescb(cb, args))
}
function setZone(speakerid, zone, cb) {
    st.send({ 'speaker': speakers[speakerid], 'path': 'setZone', 'post': zone }, (...args) => rescb(cb, args))
}
function addZoneSlave(speakerid, zone, cb) {
    st.send({ 'speaker': speakers[speakerid], 'path': 'addZoneSlave', 'post': zone }, (...args) => rescb(cb, args))
}
function removeZoneSlave(speakerid, zone, cb) {
    st.send({ 'speaker': speakers[speakerid], 'path': 'removeZoneSlave', 'post': zone }, (...args) => rescb(cb, args))
}

/**
 * 
 * @param {string} speakerid 
 * @param {object} [set] 
 * @param {cbFunc} cb 
 */
function bass(speakerid, cb, set) {
    st.send({ 'speaker': speakers[speakerid], 'path': 'bass', post: set ? { bass: set } : null }, (...args) => rescb(cb, args))
}
function name(speakerid, cb, set) {
    st.send({ 'speaker': speakers[speakerid], 'path': 'name', post: set ? { name: set } : null }, (...args) => rescb(cb, args))
}
function volume(speakerid, cb, set) {
    st.send({ 'speaker': speakers[speakerid], 'path': 'volume', post: set ? { volume: set } : null }, (...args) => rescb(cb, args))
}



function bassCapabilities(speakerid, cb) {
    st.send({ 'speaker': speakers[speakerid], 'path': 'bassCapabilities' }, (...args) => rescb(cb, args))
}
function sources(speakerid, cb) {
    st.send({ 'speaker': speakers[speakerid], 'path': 'sources' }, (...args) => rescb(cb, args))
}
function now_playing(speakerid, cb) {
    st.send({ 'speaker': speakers[speakerid], 'path': 'now_playing' }, (...args) => rescb(cb, args))
}
function getZone(speakerid, cb) {
    st.send({ 'speaker': speakers[speakerid], 'path': 'getZone' }, (...args) => rescb(cb, args))
}
function presets(speakerid, cb) {
    st.send({ 'speaker': speakers[speakerid], 'path': 'presets' }, (...args) => rescb(cb, args))
}
function info(speakerid, cb) {
    st.send({ 'speaker': speakers[speakerid], 'path': 'info' }, (...args) => rescb(cb, args))
}
function rescb(cb, origin) {
    if (!origin[0]) origin[1] = origin[1][Object.keys(origin[1])[0]][0]
    cb(...origin)
}

const eventListen = (speakerid, event, id, listener) => st.eventListen(speakers[speakerid], event, id, listener)
const endListen = (speakerid, id) => st.endListen(speakers[speakerid], id)

function stopListen(speakerid) { st.stopListen(speakers[speakerid]) }
function startListen(speakerid, cb) { st.startListen(speakers[speakerid], cb) }

module.exports = { key, seek, select, setZone, addZoneSlave, removeZoneSlave, bass, name, volume, bassCapabilities, sources, now_playing, getZone, presets, info, eventListen, stopListen, startListen, speakers, endListen }