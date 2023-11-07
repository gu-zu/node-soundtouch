const st = require("./soundtouch"),
    path = require("path"),
    speakers = JSON.parse(require("fs").readFileSync(path.join(__dirname, "conf.json"), 'utf8'))

const { stdin } = require("process");

function testReq() {
    st.request({ speaker: speakers.Portable, path: "name", post: "esd" }, (err, res) => {
        console.log(err, res)
    })
}
function testWs() {
    st.send({ speaker: speakers.Portable, path: "volume", post: { volume: "30" } }, logobj)
    return
    startListen(speakers.Portable, (err, info) => {
        if (err) return console.log("listen err", err, info)
        send({ speaker: speakers.Portable, path: "volume", post: { volume: "30" } }, logobj)
    })
    function logobj(...args) {
        args.forEach((val) => {
            console.log(val, JSON.stringify(val, null, 2))
        })
    }
}

//eventListen(speakers.Portable, "volumeUpdated", console.log)
//testReq()
testWs()

stdin.setEncoding('utf-8')
stdin.on('data', (dt) => send({ speaker: speakers.Portable, path: dt.trim() }, console.log))

function log(...args) { args.forEach((val) => { console.log(JSON.stringify(val, null, 2)) }) }