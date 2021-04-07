//필요한 모듈 선언
const express = require('express');
const http = require('http');
const logger = require('./conf/winston');
const autoStart = require('./service/autoStartService')
const dotenv = require('dotenv');

dotenv.config();

var app = express();

////////////////////////////////////////////////////////////////////////////////////////////////////
// NODE_ENV기본설정 
(function(){
    const envir = process.env.NODE_ENV;
    process.env.NODE_ENV = ( envir && (envir).trim().toLowerCase() == 'production') ? 'production' : 'development';
})();

////////////////////////////////////////////////////////////////////////////////////////////////////
//express 서버 포트 설정
const portValue = (process.env.NODE_ENV =='production' ? process.env.realport : process.env.devport );
app.set('port', portValue);

////////////////////////////////////////////////////////////////////////////////////////////////////
//서버 생성
http.createServer(app).listen(app.get('port'), function(){
    console.log('Express server listening on port ' + app.get('port'));
    logger.info('Listening on port '+app.get('port'));
});

////////////////////////////////////////////////////////////////////////////////////////////////////
//라우팅 모듈 선언
const indexRouter = require('./routes/indexRouter');
const dealRouter = require('./routes/dealRouter');
const staticsRouter = require('./routes/staticsRouter');

////////////////////////////////////////////////////////////////////////////////////////////////////
//request 요청 URL과 처리 로직을 선언한 라우팅 모듈 매핑
app.use('/', indexRouter);
app.use('/deal',dealRouter);
app.use('/statics',staticsRouter);

