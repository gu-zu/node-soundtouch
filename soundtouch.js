const http = require("http"),
    chalk = require("chalk"),
    xml = require('xml2js'), // https://www.npmjs.com/package/xml2js
    { WebSocket } = require("ws"),
    wsTimeout = 3000

/**
 * @typedef {Object} reqParams
 * @property {speaker} speaker - the speaker to target
 * @property {string} path - the path to request
 * @property {object} [post] - optional data to send in the request body
 */
/**
 * @typedef {Object} speaker
 * @property {string} ip - the speaker ip
 * @property {string} mac - the mac address
 * @property {number} reqid - the current request id for websocket
 * @property {object} reqs - the callbacks to ongoing requests are stored in this object
 * @property {string} name - the name as set on the speaker
 * @property {WebSocket} ws - the websocket object
 */
/**
 * @callback cbFunc
 * @param {Error|null} err - error if applicable
 * @param {object} res - the response object if no error
 */

/**
 * Function to request through HTTP (only use for single request, the send method uses websockets and is therefore more efficient on multiple requests+uses the same api)
 * @param {reqParams} params - params to define request
 * @param {cbFunc} cb 
 */
function request(params, cb) {
    if (!params || !params.speaker || !params.path) return cb(new Error("no target specified"))
    const req = http.request({ 'hostname': params.speaker.ip, 'method': params.post ? "POST" : "GET", path: "/" + params.path, 'port': 8090 }, (res) => {
        params.body = '';
        res.on('data', dt => params.body += dt)
        res.on('end', () => {
            xml.parseString(params.body, (err, res) => {
                if (res && res.errors) return logerr(new Error("st err: " + res.errors.error[0]._), params, cb)
                cb(err, res)
            })
        })
        res.on('error', (err) => logerr(err, params, cb))
    });
    if (params.post) {
        const builder = new xml.Builder({ renderOpts: { pretty: false } }) // pretty false for efficiency, debugging should use true for readability
        params.post = builder.buildObject(params.post)
    }
    req.on('error', (err) => logerr(err, params, cb))
    req.end(params.post)
}

/**
 * start websocket connection to specified speaker
 * @param {speaker} speaker - speaker to connect to
 * @param {cbFunc} cb - callback to indicate succesful connection or error
 */
function startListen(speaker, cb) {
    if (speaker.ws) return cb(null, speaker)
    const log = (txt) => console.log(chalk.yellow("ws: " + JSON.stringify(txt, null, 2)))

    const ws = new WebSocket("ws://" + speaker.ip + ":8080", 'gabbo', { 'handshakeTimeout': 2000 })

    ws.on('open', openWs)
    ws.on('message', handleMsg)
    ws.on('close', () => closeWs("closed"))
    ws.on('error', (err) => closeWs("err " + err.message))
    ws.on('unexpected-response', (...args) => {//whenever there is a non 300 status response it seems this is emitted
        args.unshift("unexpected response")
        logerr("ws: unexpected response", args)
        closeWs(args)
    })

    function openWs() {
        speaker.reqid = 1
        speaker.reqs = {}
        speaker.ws = ws;
        //log("opened") //debug
        //check speaker info
        send({ speaker, 'path': "info" }, (err, res) => {
            if (err) return logerr(err, res, cb)
            if (res?.info[0]?.name[0] && res?.info[0]?.$?.deviceID) {
                if (speaker.name != res?.info[0]?.name[0]) log("name diff " + speaker.name + " " + res?.info[0]?.name[0])
                if (speaker.mac != res?.info[0]?.$?.deviceID) log("mac diff " + speaker.mac + " " + res?.info[0]?.$?.deviceID)
                speaker.name = res?.info[0]?.name[0]
                speaker.mac = res?.info[0]?.$?.deviceID
                cb(null, speaker)
            } else cb(new Error("unexpected info response"), res)
        })
        speaker.ping = setInterval(() => {
            send({ speaker, path: "webserver/pingRequest" }, (err, res) => {
                try {
                    if (err) throw err
                    if (res.pingRequest[0].$.pong != "true") throw new Error("invalid response")
                }
                catch {
                    ws.terminate()
                    console.log(chalk.bgRed("ws dead"))
                }
            })
        }, 10000);
    }
    let closed = false;
    function closeWs(inf) {
        if (closed) return
        if (!speaker.ws) cb(new Error(inf))
        if (inf != "closed") log(inf)
        for (id in speaker.reqs) {
            speaker.reqs[id][0](new Error("Connection closed while waiting for response"))
            clearTimeout(speaker.reqs[id][1])
        }
        clearInterval(speaker.ping)
        delete speaker.reqs
        delete speaker.ws
        closed = true;
    }
    /**
     * Function to parse message and pass object to expecting cb
     * @param {*} data - raw message
     */
    function handleMsg(data) {
        xml.parseString(data.toString(), (err, res) => {
            if (err) return log("parse-err" + err.message)
            if (res?.msg?.header[0]?.request[0]?.$?.requestID && speaker.reqs[res?.msg?.header[0]?.request[0]?.$?.requestID]) {
                clearTimeout(speaker.reqs[res.msg.header[0].request[0].$.requestID][1])
                if (res.msg.body[0].errors) return speaker.reqs[res.msg.header[0].request[0].$.requestID][0](new Error("st err: " + res.msg.body[0].errors[0].error[0]._), res.msg.body[0])
                speaker.reqs[res.msg.header[0].request[0].$.requestID][0](null, res.msg.body[0])
                delete speaker.reqs[res.msg.header[0].request[0].$.requestID]
            } else if (res?.updates) {
                const type = Object.keys(res.updates)[1]
                if (speaker.listeners && speaker.listeners[type]) speaker.listeners[type].forEach((fn) => fn[0](res.updates[type][0][Object.keys(res.updates[type][0])[0]][0]))
            }
        })
    }
}
/**
 * stop websocket connection to specified speaker
 * @param {speaker} speaker - speaker to stop connection to
 */
function stopListen(speaker) { if (speaker.ws) speaker.ws.close() }
/**
 * start listening to events emitted by soundtouch - persists through disconnects/reconnects but can be stopped with endListen()
 * @param {speaker} speaker - the speaker to listen to
 * @param {string} event - the event to subscribe to
 * @param {string} id - the listener id to keep track
 * @param {function} listener - the callback function upon receiving the event
 */
function eventListen(speaker, event, id, listener) {
    if (!speaker.listeners) speaker.listeners = {}
    if (!speaker.listeners[event]) speaker.listeners[event] = [];
    speaker.listeners[event].push([listener, id]);
}
/**
 * removes all listeners with *id* from speaker, if no listeners left, will close the websocket
 * @param {speaker} speaker speaker to remove listeners from
 * @param {string} id listener id to remove
 */
function endListen(speaker, id) {
    if (!speaker.listeners) return
    for (const event in speaker.listeners) {
        for (i = 0; i < speaker.listeners[event].length; i++)
            if (speaker.listeners[event][i][1] == id) speaker.listeners[event].splice(i, 1)
        if (!speaker.listeners[event].length) delete speaker.listeners[event]
    }
    if (!Object.keys(speaker.listeners).length)
        stopListen(speaker)
}
/**
 * !unused - Gets the amount of current listeners for a speaker event
 * @param {speaker} speaker the speaker to check
 * @param {string} event the event to check
 * @returns {number} the amount of listeners
 */
function listenerCount(speaker, event) {
    if (!speaker.listeners || !speaker.listeners[event]) return 0
    return speaker.listeners[event].length
}
/**
 * !unused - clear listeners for event or all of speaker if no event is specified
 * @param {speaker} speaker 
 * @param {string} [event] 
 */
function clearListeners(speaker, event) {
    if (!speaker.listeners) return
    if (event) {
        if (!speaker.listeners[event]) return
        delete speaker.listeners[event];
    } else delete speaker.listeners;
}
/**
 * Function to request through websocket
 * @param {reqParams} params - params to define request
 * @param {cbFunc} cb 
 */
function send(params, cb) {
    if (!params.speaker.ws) return startListen(params.speaker, (err, res) => {
        if (err) return cb(err)
        send(params, cb)
    })
    const reqid = params.speaker.reqid++
    const builder = new xml.Builder({ 'renderOpts': { 'pretty': false } })
    const obj = {
        msg: {
            header: {
                $: {
                    deviceID: params.speaker.mac
                    , url: params.path, method: params.post ? "POST" : "GET"
                },
                request: {
                    $: { requestID: reqid },
                    info: { $: { type: "new" } }
                }
            }
        }
    }
    if (params.post) obj.msg.body = params.post

    params.speaker.ws.send(builder.buildObject(obj), (err) => {
        if (err) return cb(err)
        params.speaker.reqs[reqid] = [cb,
            // timeout for response
            setTimeout(() => {
                if (params.speaker.reqs[reqid]) {
                    params.speaker.ws.terminate()
                    console.log(chalk.bgRed("ws timeout"))
                }
            }, wsTimeout)];
    })
}

function logerr(err, params, cb) {
    let data
    if (params?.speaker?.ws) {
        data = JSON.parse(JSON.stringify(params))
        data.speaker.ws = "active"
    } else data = params
    console.log(chalk.red("new err noted: " + err.message))
    require('fs').appendFileSync(path.join(__dirname, "errors.log"), "time: " + new Date().toLocaleString() + "\nerror: " + err.message + "\n" + "data: " + JSON.stringify(data, null, 2) + "\n\n")
    if (cb) cb(err, params)
}



exports.send = send;
exports.request = request;
exports.eventListen = eventListen;
exports.stopListen = stopListen;
exports.startListen = startListen;
exports.endListen = endListen;