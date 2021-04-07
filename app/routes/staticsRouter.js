// express setting
const express = require('express');
const router = express.Router();

const logger = require('../conf/winston');
const staticsObj = require('../service/staticsService');
const jsonUtil = require('../util/jsonUtil');

module.exports = router;
////////////////////////////////////////////////////////////////////////////////////////////////////
// Router
// 일별 수익/수수료 정보조회

// jsonMsg 초기화
const jsonObj = jsonUtil.getJsonObj('staticsRouter');

// staticsService 초기화
staticsObj.initDealSet();

/**
 * param : 
 *  starttime   : 시작시간(단위 : 시, ex. starttime=20 --> 20시간전)
 *  endtime     : 종료시간(단위 : 시, ex. endstart=19  --> 19시간전)
 *  symbol      : 대상코인심볼(default, all)
 *  datetype    : 날짜타입(일단위(D) / 월단위(M), default : D)
 *  detailfixed : 소수점 정밀도여부(true:5자리 / false:2자리, default : false)
 *  
 *  ex. /netincome?symbol=BTC&starttime=72&endtime=48
 *  --> 72~48시간 전 사이의 데이터 가져오기
 * 
 * json구조 Arr안에 json
 * [
 *   json.profit    일별 총이익  
 *   json.buyFee    일별 매수수수료비용
 *   json.sellFee   일별 매도수수료비용
 *   json.totalFee  일별 총수수료비용
 *   json.netIncome 일별 순손익
 *   json.feeRate   일별 총이익대비 수수료비율
 *   json.prfRate   일별 초기계좌대비 총이익비율
 * ]
 */
router.get('/netincome', function(req, res, next) {
    const starttime = req.query.starttime;
    const endtime = req.query.endtime;
    const symbol = req.query.symbol;
    const dateType = req.query.datetype;
    const detailfixed = req.query.detailfixed;
    const isfutures = req.query.isfutures;
    
    logger.info('netincome. symbol:'+symbol);
    staticsObj.selectNetIncome(symbol, starttime, endtime, dateType, detailfixed, isfutures)
    .then((json)=>res.send(json))
    .catch((err)=>res.send(jsonObj.getMsgJson('-1',err)));
});

/**
 * 비트코인 가격추이 가져오기
 * ex. /bitcoinprice?datetype=D&starttime=72&endtime=48
 */
router.get('/bitcoinprice', function(req, res, next) {
    const datetype = req.query.datetype;
    const starttime = req.query.starttime;
    const endtime = req.query.endtime;
    
    logger.info('bitcoinprice is very big. cant working.');
    res.send(jsonObj.getMsgJson('-1',' bitcoinprice is very big. cant working.'));

    // bitcoinprice 산정 API 일시막음.
    // staticsObj.selectBitCoinPrice(datetype, starttime, endtime)
    // .then((json)=>res.send(json))
    // .catch((err)=>res.send(jsonObj.getMsgJson('-1',err)));
});

/**
 * 특정기간동안 총수익/수수료/순손익 계산
 * ex. /bitcoinprice?symbol=BTC&starttime=72&endtime=48
 */
router.get('/totNetIncome', function(req, res, next) {
    const starttime = req.query.starttime;
    const endtime = req.query.endtime;
    const symbol = req.query.symbol;
    
    logger.info('selectTotalNetIncome. symbol:'+symbol);
    staticsObj.selectTotalNetIncome(symbol, starttime, endtime)
    .then((json)=>res.send(json))
    .catch((err)=>res.send(jsonObj.getMsgJson('-1',err)));
});

/**
 * 에러 통계 (보고기준)
 * ex. /errorinfo?starttime=72&endtime=48
 */
router.get('/errorinfo', function(req, res, next) {
    const starttime = req.query.starttime;
    const endtime = req.query.endtime;
    
    logger.info('errorinfo');
    staticsObj.selectErrorInfo(starttime, endtime)
    .then((json)=>res.send(json))
    .catch((err)=>res.send(jsonObj.getMsgJson('-1',err)));
});
