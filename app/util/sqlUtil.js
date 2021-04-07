const bConst = require('../util/bitConst');
const obj2Str = require('./objectUtil');
const logger = require('../conf/winston');
const mysql = require('mysql');
const connection = require('./sqldb/sqlConnector');
const objUtil = require('./objectUtil');

let sqlObj = {};

(function(){
    sqlObj.connect = function(){
        connection.connect();
    };
    ////////////////////////////////////////////////////////////
    // Promise
    /**
     * 반환값 꼴
     * err null (에러나봐야 알 것 같다.)
     * 
     * result OkPacket {
     * fieldCount: 0,
     * affectedRows: 1,
     * insertId: 0,
     * serverStatus: 2,
     * warningCount: 0,
     * message: '',
     * protocol41: true,
     * changedRows: 0 
     * }
     * @param {any} query 쿼리문
     * @param {any} values insert시 값
     */
    function queryPromise(query, values){
        const promise = new Promise(
            (resolve, reject)=>{
                if(query && values && values.length > 0){
                    logger.info('queryPromise ==> query OK, values OK');
                    connection.query(query,values, function(err, result){
                        if(err){
                            logger.info('err');
                            logger.info(err);
                            return reject(err);
                        }
    
                        return resolve(result);
                    });

                }else{
                    logger.info('queryPromise ==> query OK');
                    connection.query(query, function(err, result){
                        if(err){
                            return reject(err);
                        }
    
                        return resolve(result);
                    });
                }
            }
        );

        return promise;
    }

    ////////////////////////////////////////////////////////////
    // Select
    sqlObj.selectSbHistory = function(symbol, startTime, endTime, orderby){
        let queryStr = 'select * from sb_history where del="N" '

        if(symbol){ queryStr += 'and symbol="'+symbol+'" ' }

        if(startTime){ queryStr += 'and transactTime > '+startTime; }
        if(endTime){ queryStr += 'and transactTime < '+endTime; }

        if(orderby && orderby.toUpperCase() =='DESC'){ queryStr += ' order by transactTime desc ' }
        else {queryStr += ' order by transactTime asc ' };

        logger.info('[selectSbHistory] query : '+queryStr);

        return queryPromise(queryStr);
    };

    sqlObj.selectSbHistoryWithoutSymbol = function(symbol, startTime, endTime, orderby){
        let queryStr = 'select * from sb_history where del="N" '

        if(symbol){ queryStr += 'and symbol <> "'+symbol+'" ' }

        if(startTime){ queryStr += 'and transactTime > '+startTime; }
        if(endTime){ queryStr += 'and transactTime < '+endTime; }

        if(orderby && orderby.toUpperCase() =='DESC'){ queryStr += ' order by transactTime desc ' }
        else {queryStr += ' order by transactTime asc ' };

        logger.info('[selectSbHistory] query : '+queryStr);

        return queryPromise(queryStr);
    };

    sqlObj.selectOldHistory = function(symbol, startTime, endTime, orderby){
        let queryStr = 'select * from old_history where del="N" '

        if(symbol){ queryStr += 'and symbol="'+symbol+'" ' }

        if(startTime){ queryStr += ' and sellTime > '+startTime; }
        if(endTime){ queryStr += ' and sellTime < '+endTime; }

        if(orderby && orderby.toUpperCase() =='DESC'){ queryStr += ' order by sellTime desc ' }
        else { queryStr += ' order by sellTime asc ' };

        logger.info('[selectOldHistory] query : '+queryStr);

        return queryPromise(queryStr);
    };

    /**
     * descrition에 따른 평균 손익률 및 손익횟수 반환
     */
    sqlObj.selectOldHistoryAvgNRate = function(symbol, descrition){
        let queryStr = 'select avg(profitRate) as "avg", count(profitRate) "cnt" from old_history  where del ="N" '

        if(symbol){ queryStr += 'and symbol="'+symbol+'" ' }

        if(descrition) {queryStr += 'and descrition= "'+descrition+'" ';}

        logger.info('[selectOldHistoryAvgNRate] query : '+queryStr);

        return queryPromise(queryStr);
    };

    sqlObj.selectTradingHistory = function(symbol, startTime, endTime, orderby){
        let queryStr = 'select * from trading_history where del="N" '

        if(symbol){ queryStr += 'and symbol="'+symbol+'" ' }

        if(startTime){ queryStr += 'and tradeTime > '+startTime; }
        if(endTime){ queryStr += 'and tradeTime < '+endTime; }

        if(orderby && orderby.toUpperCase() =='DESC'){
            queryStr += ' order by tradeTime desc ' ;
        }else{
            queryStr += ' order by tradeTime asc ' ;
        }

        logger.info('[selectTradingHistory] query : '+queryStr);

        return queryPromise(queryStr);
    };

    sqlObj.selectDealSetting = function(symbol){
        let queryStr = 'select * from deal_settings where del="N" and symbol="'+symbol+'";'

        logger.info('[selectDealSetting] query : '+queryStr);

        return queryPromise(queryStr);
    };

    sqlObj.selectBitCoinPriceInfo = function(){
        let queryStr = 'select * from bitcoin_price_info'

        logger.info('[selectBitCoinPriceInfo] query : '+queryStr);

        return queryPromise(queryStr);
    };

    sqlObj.selectLastBitCoinPriceInfo = function(isUseStdDate, stdDate){
        let queryStr = '';

        if(!isUseStdDate){
            queryStr = 'select * from bitcoin_price_info ';
        }else{
            queryStr = 'select * from bitcoin_price_info where time < '+stdDate;
        }

        queryStr += ' order by id desc limit 10;';

        logger.info('[selectBitCoinPriceInfo] query : '+queryStr);

        return queryPromise(queryStr);
    };

    sqlObj.selectLastBnbPriceInfo = function(isUseStdDate, stdDate){
        let queryStr = '';

        if(!isUseStdDate){
            queryStr = 'select * from bnb_price_info ';
        }else{
            queryStr = 'select * from bnb_price_info where time < '+stdDate;
        }

        queryStr += ' order by id desc limit 10;';

        logger.info('[selectBitCoinPriceInfo] query : '+queryStr);

        return queryPromise(queryStr);
    };

    sqlObj.selectHitCntHistory = function(symbol){
        let queryStr = 'select * from hit_cnt_history where del="N" '

        if(symbol){ queryStr += 'and symbol="'+symbol+'" ' }

        logger.info('[selectHitCntHistory] query : '+queryStr);

        return queryPromise(queryStr);
    };

    /**
     * 계좌 입출금내역 기록 조회(순수투자금에 한해 입출금된 내역)
     * @param {any} startTime 시작시간(Hour)
     * @param {any} endTime 종료시간(Hour)
     * @param {any} orderby 정렬타입(desc/asc)
     */
    sqlObj.selectDwDetailHistory = function(startTime, endTime, orderby){
        let queryStr = 'select * from dw_detail_history where del="N" '

        if(startTime){ 
            const cnvtStartTime = ''.concat(objUtil.getYYYYMMDD(startTime), objUtil.getHHMM(startTime)) ;
            queryStr += ' and dw_time > '+cnvtStartTime; 
        }

        if(endTime){ 
            const cnvtEndTime = ''.concat(objUtil.getYYYYMMDD(endTime), objUtil.getHHMM(endTime)) ;
            queryStr += ' and dw_time < '+cnvtEndTime; 
        }

        if(orderby && orderby.toUpperCase() =='DESC'){ queryStr += ' order by dw_time desc ' }
        else { queryStr += ' order by dw_time asc ' };

        logger.info('[selectDwDetailHistory] query : '+queryStr);

        return queryPromise(queryStr);
    };

    /**
     * 
     * @param {any} dateType 날짜타입(D/M/Y)(미선택시, D기본)
     * @param {any} startTime 시작시간(선택)
     * @param {any} endTime 끝난시간(선택)
     */
    sqlObj.selectBitCoinPriceStatics = function(dateType, startTime, endTime){
        let commQuery =   " select                "
                         +"   format(avg(price),6) avgPrice "
                         +" , format(max(price),6) maxPrice "
                         +" , format(min(price),6) minPrice "
                         +" , format(sum(qty)  ,6) totQty     "
        ;

        let whereQuery = ' ';

        switch(dateType){
            case bConst.DATE_TYPE.MON : 
            whereQuery = 
                " , date_ymd date_ym                                                      "
                +" from (                                                                  "
                +" 	select                                                                 "
                +" 	  price                                                                "
                +" 	, qty                                                                  "
                +" 	, date_format(from_unixtime((time/1000)+9*3600), '%Y-%m') date_ym      "
                +"                                                                         "
                +" 	from bitcoin_price_info "
                +" 	where 1=1               "

                if(startTime){ whereQuery += ' and time > '+startTime; }
                if(endTime){ whereQuery += ' and time < '+endTime; }

                whereQuery +=" ) a "

            break;

            case bConst.DATE_TYPE.YER : 
            whereQuery = 
                " , date_ymd date_y                                                      "
                +" from (                                                                  "
                +" 	select                                                                 "
                +" 	  price                                                                "
                +" 	, qty                                                                  "
                +" 	, date_format(from_unixtime((time/1000)+9*3600), '%Y') date_y          "
                +"                                                                         "
                +" 	from bitcoin_price_info "
                +" 	where 1=1               "

                if(startTime){ whereQuery += ' and time > '+startTime; }
                if(endTime){ whereQuery += ' and time < '+endTime; }

                whereQuery +=" ) a "
            break;
            
            default : 
            whereQuery = 
                " , date_ymd dateYmd                                                      "
                +" from (                                                                  "
                +" 	select                                                                 "
                +" 	  price                                                                "
                +" 	, qty                                                                  "
                +" 	, date_format(from_unixtime((time/1000)+9*3600), '%Y-%m-%d') date_ymd  "
                +" "
                +" 	from bitcoin_price_info "
                +" 	where 1=1               "

                if(startTime){ whereQuery += ' and time > '+startTime; }
                if(endTime){ whereQuery += ' and time < '+endTime; }

                whereQuery +=" ) a "
        }

        let groupByQuery = '';

        switch(dateType){
            case bConst.DATE_TYPE.MON : 
            groupByQuery = 
                 " group by  "
                +" a.date_ym "
                +" ;         "

            break;

            case bConst.DATE_TYPE.YER : 
            groupByQuery = 
                 " group by  "
                +" a.date_y "
                +" ;         "

            break;

            default : 
            groupByQuery = 
                 " group by  "
                +" a.dateYmd "
                +" ;         "
        }

        let queryStr = commQuery + whereQuery + groupByQuery;

        logger.info('[selectBitCoinPriceStatics] query : '+queryStr);

        return queryPromise(queryStr);
    }

    /**
     * 특정기간동안 총수익/수수료/순손익 계산
     */
    sqlObj.selectTotalNetIncome = function(symbol, startTime, endTime){
        let queryStr = 
             'select truncate(sum(profit), 5) totProfit '
            +',truncate(sum( buyFee + sellFee ), 5) totalFee '
            +',truncate(sum(profit - (( buyFee + sellFee )) ), 5) totNetincome from old_history  '
            +' where 1=1 '
            ;

            if(symbol){ queryStr += 'and symbol="'+symbol+'" ' }

            if(startTime){ queryStr += ' and sellTime > '+startTime; }
            if(endTime){ queryStr += ' and sellTime < '+endTime; }

        logger.info('[selectTotalNetIncome] query : '+queryStr);

        return queryPromise(queryStr);
    };

    /**
     * 에러 통계
     * 반환된 값의 컬럼 (cnt/date_ymd)
     */
    sqlObj.selectErrorInfo = function(startTime, endTime){
        let whereStr = ' where 1=1 ';
        if(startTime){ whereStr += ' and errorTime > '+startTime; }
        if(endTime){ whereStr += ' and errorTime < '+endTime; }        
        
        let queryStr = 
             'select count(errorId) cnt , date_ymd '
            +'from ('
            +"select *, date_format(from_unixtime((errorTime/1000)+9*3600), '%Y-%m-%d') date_ymd from error_history "
            +whereStr
            +' )a '
            +' group by a.date_ymd '
            ;

        logger.info('[selectErrorInfo] query : '+queryStr);

        return queryPromise(queryStr);
    }

    ////////////////////////////////////////////////////////////
    // Insert
    sqlObj.insertSbHistory = function(arr){
        const queryStr = 'INSERT INTO sb_history (orderId, clientOrderId, transactTime, price, qty, buyFee, sellFee, innerAccNo, symbol, del) VALUES (?);';
        let values = [];

        logger.info('[insertSbHistory] query : '+queryStr);
        
        if(arr && arr.length > 0){
            arr.forEach(el => {
                const value = [el.orderId, el.clientOrderId, el.transactTime, el.price, el.qty, el.buyFee, el.sellFee, el.innerAccNo, el.symbol, 'N'];
                values.push(value);
            });

            logger.debug('values ==> \n'+obj2Str.objView(values));
            return queryPromise(queryStr, values);
        }
    };

    sqlObj.insertOldHistory = function(arr){
        const queryStr = 'INSERT INTO old_history (clientOrderId, descrition, buyPrice, sellPrice, sbQty, buyFee, sellFee, profit, profitRate, sellTime, innerAccNo, symbol, del) VALUES (?);';
        let values = [];

        logger.info('[insertOldHistory] query : '+queryStr);

        if(arr && arr.length > 0){
            arr.forEach(el => {
                const value = [el.clientOrderId, el.descrition, el.buyPrice, el.sellPrice, el.sbQty, el.buyFee, el.sellFee, el.profit, el.profitRate, el.sellTime, el.innerAccNo, el.symbol, 'N'];
                values.push(value);
            });

            logger.debug('values ==> \n'+obj2Str.objView(values));
            return queryPromise(queryStr, values);
        }
    };

    sqlObj.insertTradingHistory = function(arr){
        const queryStr = 'INSERT INTO trading_history (tradeType, clientOrderId, sbPrice, sbQty, tradePrice, tradeQty, tradeTime, innerAccNo, symbol, del) VALUES (?);';
        let values = [];

        logger.info('[insertTradingHistory] query : '+queryStr);

        if(arr && arr.length > 0){
            arr.forEach(el => {
                const value = [el.tradeType, el.clientOrderId, el.sbPrice, el.sbQty, el.tradePrice, el.tradeQty, el.tradeTime, el.innerAccNo, el.symbol, 'N'];
                values.push(value);
            });

            logger.debug('values ==> \n'+obj2Str.objView(values));
            return queryPromise(queryStr, values);
        }
    };

    sqlObj.insertBitCoinPriceInfo = function(arr){
        const queryStr = 'INSERT INTO bitcoin_price_info (id, price, qty, quoteQty, time, isBuyerMaker, isBestMatch, del) VALUES (?);';
        let values = [];

        logger.info('[insertBitCoinPriceInfo] query : '+queryStr);

        if(arr && arr.length > 0){
            arr.forEach(el => {
                const value = [el.id, el.price, el.qty, el.quoteQty, el.time, el.isBuyerMaker, el.isBestMatch, 'N'];
                values.push(value);
            });

            logger.debug('values ==> \n'+obj2Str.objView(values));
            return queryPromise(queryStr, values);
        }
    };

    sqlObj.insertEmailSendHistory = function(arr){
        const queryStr = 'INSERT INTO email_send_history (email_subject, email_content, sendTime, del) VALUES (?);';
        let values = [];

        logger.info('[insertEmailSendHistory] query : '+queryStr);
        
        if(arr && arr.length > 0){
            arr.forEach(el => {
                const value = [el.email_subject, el.email_content, el.sendTime, 'N'];
                values.push(value);
            });

            logger.debug('values ==> \n'+obj2Str.objView(values));
            return queryPromise(queryStr, values);
        }
    };

    sqlObj.insertKellyRateHistory = function(arr){
        const queryStr = 'INSERT INTO kelly_rate_history (generalCnt, generalRate, clearingCnt, clearingRate, odds, kellyRate, sbCash, calcTime, modKellyValue, modKellyRate, orderKellyRate, symbol, del) VALUES (?);';
        let values = [];

        logger.info('[insertKellyRateHistory] query : '+queryStr);
        
        if(arr && arr.length > 0){
            arr.forEach(el => {
                const value = [
                     el.generalCnt  
                    ,el.generalRate 
                    ,el.clearingCnt 
                    ,el.clearingRate
                    ,el.odds        
                    ,el.kellyRate   
                    ,el.sbCash
                    ,el.calcTime
                    ,el.modKellyValue
                    ,el.modKellyRate
                    ,el.orderKellyRate
                    ,el.symbol
                    ,'N'
                ];
                values.push(value);
            });

            logger.debug('values ==> \n'+obj2Str.objView(values));
            return queryPromise(queryStr, values);
        }
    };

    sqlObj.insertHitCntHistory = function(arr){
        const queryStr = 'INSERT INTO hit_cnt_history (clientOrderId ,tradeType ,hitBuyCnt ,hitBuyRate ,hitSellCnt ,hitSellRate ,definedHitBuyCnt ,definedHitBuyRate ,definedHitSellCnt ,definedHitSellRate ,loopCnt ,hitTime, innerAccNo, GapOutCnt, maxGapOutCnt, symbol, del ) VALUES (?);';                    
        let values = [];

        logger.info('[insertHitCntHistory] query : '+queryStr);
        
        if(arr && arr.length > 0){
            arr.forEach(el => {
                const value = [
                    el.clientOrderId  
                    ,el.tradeType      
                    ,el.hitBuyCnt    
                    ,el.hitBuyRate   
                    ,el.hitSellCnt   
                    ,el.hitSellRate  

                    ,el.definedHitBuyCnt  
                    ,el.definedHitBuyRate 
                    ,el.definedHitSellCnt 
                    ,el.definedHitSellRate
                    ,el.loopCnt         
                    ,el.hitTime        
                    ,el.innerAccNo

                    ,el.GapOutCnt
                    ,el.maxGapOutCnt
                    ,el.symbol

                    ,'N'
                ];
                values.push(value);
            });

            logger.debug('values ==> \n'+obj2Str.objView(values));
            return queryPromise(queryStr, values);
        }
    };

    sqlObj.insertErrorHistory = function(arr){
        const queryStr = 'INSERT INTO error_history (errorMsg ,errorTime ,sendFlag ,sendTime ,del ) VALUES (?);';
        let values = [];

        logger.info('[insertErrorHistory] query : '+queryStr);
        
        if(arr && arr.length > 0){
            arr.forEach(el => {
                const value = [
                    el.errorMsg 
                    ,el.errorTime 
                    ,el.sendFlag 
                    ,el.sendTime 
                    ,'N'
                ];
                values.push(value);
            });

            logger.debug('values ==> \n'+obj2Str.objView(values));
            return queryPromise(queryStr, values);
        }
    };

    ////////////////////////////////////////////////////////////
    // Delete
    sqlObj.deleteSbHistory = function(clientOrderId, transactTime){
        const queryStr = 'UPDATE sb_history set del="Y" '
                       + 'where clientOrderId="'+(clientOrderId?clientOrderId:'')+'" '
                       + 'and transactTime="'+(transactTime?transactTime:'')+'" ';

        logger.info('[deleteSbHistory] query : '+queryStr);        
        return queryPromise(queryStr);
    };

    sqlObj.deleteOldHistory = function(){

    };

    sqlObj.deleteTradingHistory = function(){

    };


    ////////////////////////////////////////////////////////////
    // Slack 
    sqlObj.insertSlackHistory = function(arr){
        const queryStr = 'INSERT INTO slack_history (slackType, slackTitle, slackMsg, slackTime, sendFlag, sendTime, del ) VALUES (?);';
        let values = [];

        logger.info('[insertErrorHistory] query : '+queryStr);
        
        if(arr && arr.length > 0){
            arr.forEach(el => {
                const value = [
                     el.slackType
                    ,el.slackTitle
                    ,el.slackMsg
                    ,el.slackTime
                    ,el.sendFlag 
                    ,el.sendTime 
                    ,'N'
                ];
                values.push(value);
            });

        }

        logger.debug('values ==> \n'+obj2Str.objView(values));
        return queryPromise(queryStr, values);
    };
    // Slack 
    ////////////////////////////////////////////////////////////



})();

module.exports = sqlObj;