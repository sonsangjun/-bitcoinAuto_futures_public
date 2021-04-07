// express setting
const express = require('express');

const router = express.Router();

const objUtil = require('../util/objectUtil');
const jsonUtil = require('../util/jsonUtil');
const logger = require('../conf/winston');
const sql = require('../util/sqlUtil');
const mailer = require('../util/emailUtil');
const orderObj = require('../service/dealService');

const modeStr = objUtil.getMode();
const isDev = objUtil.checkDevMode();

////////////////////////////////////////////////////////////////////////////////////////////////////
// Router
// 거래전 초기화
router.get('/init', async function(req, res, next) {
    await orderObj.init();
    let msg = '['+modeStr+'] dealService init';

    logger.info(msg);
    res.send(msg);
});

// 거래시작 (Deal Start)
router.get('/run', function(req, res, next) {
    let msg = orderObj.run();
    msg = (msg ? ('['+modeStr+'] '+msg)  : 'dealService run fail');

    logger.info(msg);
    res.send(msg);
});

// 거래종료 (Deal stop)
router.get('/stop', function(req, res, next) {
    orderObj.stopOrdering();

    logger.info('['+modeStr+'] dealService stop');
    res.send('['+modeStr+'] stop~~');
});

// (현재 보유비트코인에 대한 거래내역) Deal History For current Bitcoin
router.get('/sbhistory', function(req, res, next) {
    logger.info('getSbHistory');
    res.send(orderObj.getSbHistory());
});

// (매매가 종료된 이전 거래내역) previous Deal History
// timezone : 시간대(kor)
// stime : N시간전(ex. N : 24)
router.get('/oldhistory', function(req, res, next) {
    logger.info('getOldHistory(with KorTime');
    
    const starttime = req.query.starttime;
    const timezone = req.query.timezone;

    // deprecated, instead req.query or req.body
    // console.warn(req.param('timezone')); 
    
    const timeZoneUpper = (timezone ? timezone.toUpperCase() : null);
    let startUnixTime = Number(starttime);
    startUnixTime = (String(startUnixTime) == 'NaN' ? null : (Date.now() - (startUnixTime*1000*3600)));

    let resultPromise = sql.selectOldHistory(startUnixTime);
    logger.debug('oldhistory target Timezone:'+timezone+', time:'+starttime+', unixTime:'+startUnixTime);

    resultPromise
    .then((result)=>{
        if(result && result.length > 0){
            const mSec = 1000;
            let timezoneValue = 0;
            
            switch(timeZoneUpper){
                case 'KOR' : timezoneValue = 9 * 3600 * mSec; break;
                default    : timezoneValue = 0; break;
            }

            result.forEach((obj)=>{
                obj.timezone = (new Date(obj.sellTime+timezoneValue)).toISOString();
            });
            
            res.send(result);
        }else{
            res.send({});
        }
    })
    .catch((err)=>res.send(err));;
});

// (매매 체결내역) trading History
router.get('/tradinghistory', function(req, res, next) {
    logger.info('tradingHistory');
    res.send(orderObj.getTradingHistory());
});

// (이전 매매내역 초기화) 
router.get('/resetsbhistory', function(req, res, next){
    logger.info('resetSbHistory');
    orderObj.resetSbHistory();

    res.send('['+modeStr+'] resetSbHistory call');
});

// 현재계좌정보(String)
router.get('/curaccinfo', function(req, res, next){
    logger.info('/curaccinfo call');

    orderObj.getPriceOfSymbol().then(function(result){
        if(!result){
             return res.send('['+modeStr+'] fail getcuraccinfo');
        }

        let msg = '['+modeStr+']<br>[curPrice: '+result.price+']<br>'+ orderObj.getCurAccInfo(result.price);
        msg += '<br><br>*if accinfo is invalid, plz call deal/init.';

        return res.send(msg);

    }).catch(function(err){
        return res.send(jsonUtil.getMsgJson('-1',err));
    });
});

//////////////////////////////////////////////////////////////////////
// 개발시에만 활성화(url)
// Mailing
router.get('/mailer',function(req,res,next){
    if(!isDev){
        return res.send('noneDevMode');
    }

    mailer.getTransporter().then(function(mailSvc){
        mailSvc.staticSendMail('침팬지','가이겼다')
        .then((obj)=>res.send(obj))
        .catch((obj)=>res.send(obj));

    }).catch(function(err){
        logger.error('getTransporter fail');
        logger.error(err);
        res.send(err);
    });
});

router.get('/testOrder',async function(req,res,next){
    if(!isDev){
        return res.send('noneDevMode');
    }

    let resJson = {code : '-1' , msg : 'testOrder fail'};

    try{
        // resJson = await orderObj.callOrder('BTCUSDT','BUY','MARKET','0.01');
        resJson = await orderObj.callOrder('BNBUSDT','BUY','MARKET','50');
    }catch(err){
        console.error('err',err);
    }
    
    res.send(resJson);
});

router.get('/insfee',async function(req,res,next){
    if(!isDev){
        return res.send('noneDevMode');
    }

    const insData = {
        symbol     : 'BTCUSDT',
        tranId     : Date.now(),
        incomeType : 'FUNDING_FEE',
        income     : '0.05',
        asset      : 'USDT',
        time       : Date.now()
    };

    let resJson = {code : '-1' , msg : 'testOrder fail'};

    try{
        resJson = await orderObj.insIncomeOfFundingFee([insData]);
    }catch(err){
        console.error('err',err);
    }
    
    res.send(resJson);
});

// 개발시에만 활성화(url)
//////////////////////////////////////////////////////////////////////

// Router
////////////////////////////////////////////////////////////////////////////////////////////////////

module.exports = router;