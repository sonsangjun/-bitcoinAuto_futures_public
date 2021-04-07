var express = require('express');
var router = express.Router();

// spring의 controller역할
//라우터의 get()함수를 이용해 request URL('/')에 대한 업무처리 로직 정의
router.get('/', function(req, res, next) {
    console.log('start page');
    res.send('index page');
});

//모듈에 등록해야 web.js(server.js)에서 app.use 함수를 통해서 사용 가능
module.exports = router;