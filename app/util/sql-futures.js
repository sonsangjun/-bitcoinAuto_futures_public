const bConst = require('../util/bitConst');
const obj2Str = require('./objectUtil');
const logger = require('../conf/winston');
const mysql = require('mysql');
const connection = require('./sqldb/sqlConnector');
const objUtil = require('./objectUtil');


module.exports = (function(){
    let sqlObj = {};

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
    };

    /**
     * 보유중인 포지션 목록 가져오기 (거래시간 기준)
     * @param {any} symbol 거래심볼
     * @param {any} tradeType 거래타입(B/S)
     * @param {any} startTime [선택]시작시간
     * @param {any} endTime [선택]종료시간
     * @param {any} orderby [선택]소팅순서, 기본 DESC (소팅기준 : 거래시간)
     * @returns 
     */
    sqlObj.selectFuturesSbHistory = function(symbol, tradeType, startTime, endTime, orderby){
        let queryStr = 'select * from futures_sb_history where del="N" '

        if(tradeType){ queryStr += 'and tradeType="'+tradeType+'" '}

        if(symbol){ queryStr += 'and symbol="'+symbol+'" ' }

        if(startTime){ queryStr += 'and transactTime > '+startTime; }
        if(endTime){ queryStr += 'and transactTime < '+endTime; }

        if(orderby && orderby.toUpperCase() =='ASC'){ queryStr += ' order by transactTime asc ' }
        else {queryStr += ' order by transactTime desc ' };

        logger.info('[selectFuturesSbHistory] query : '+queryStr);

        return queryPromise(queryStr);
    };

    /**
     * 보유중인 포지션 목록 가져오기 (가격기준)
     * @param {any} symbol 거래심볼
     * @param {any} tradeType 거래타입(B/S)
     * @param {any} startTime [선택]시작시간
     * @param {any} endTime [선택]종료시간
     * @param {any} orderby [선택]소팅순서, 기본 DESC (소팅기준 : 거래시간)
     * @returns 
     */
     sqlObj.selectFuturesSbHistoryWithPrice = function(symbol, tradeType, startTime, endTime, orderby){
        let queryStr = 'select * from futures_sb_history where del="N" '

        if(tradeType){ queryStr += 'and tradeType="'+tradeType+'" '}

        if(symbol){ queryStr += 'and symbol="'+symbol+'" ' }

        if(startTime){ queryStr += 'and transactTime > '+startTime; }
        if(endTime){ queryStr += 'and transactTime < '+endTime; }

        if(orderby && orderby.toUpperCase() =='ASC'){ queryStr += ' order by price asc ' }
        else {queryStr += ' order by price desc ' };

        logger.info('[selectFuturesSbHistoryWithPrice] query : '+queryStr);

        return queryPromise(queryStr);
    };

    /**
     * 지나간 거래 목록 조회 (단건)
     * @param {any} symbol 거래심볼
     * @param {any} tradeType 거래타입
     * @param {any} clientOrderId 클라이언트ID
     * @param {any} orderby [선택]소팅순서, 기본 DESC
     * @returns 
     */
    sqlObj.selectPastFuturesSbHistory = function(symbol, tradeType, clientOrderId, orderId, orderby){
        let queryStr = 'select * from futures_sb_history '

        if(!(clientOrderId && orderId)){
            logger.debug('clientOrderId and orderId is Mandatory.');
            return [];
        }else{
            queryStr += 'where clientOrderId="'+clientOrderId+'" and orderId="'+orderId+'" ';
        }

        if(tradeType){ queryStr += 'and tradeType="'+tradeType+'" '}
        if(symbol){ queryStr += 'and symbol="'+symbol+'" ' }
        if(orderby && orderby.toUpperCase() =='ASC'){ queryStr += ' order by price asc ' }
        else {queryStr += ' order by price desc ' };

        logger.info('[selectPastFuturesSbHistory] query : '+queryStr);

        return queryPromise(queryStr);
    }

    /**
     * 현선간 공유 데이터 조회
     * @param {any} symbol 거래심볼
     * @param {any} startTime [선택]시작시간
     * @param {any} endTime [선택]종료시간
     * @param {any} orderby [선택]소팅순서, 기본 asc
     * @returns 
     */
    sqlObj.selectFuturesSpotTradingHistory = function(symbol, startTime, endTime, orderby){
        let queryStr = 'select * from futures_spot_trading_history where del="N" and isOrder="N" '

        if(symbol){ queryStr += 'and symbol="'+symbol+'" ' }

        if(startTime){ queryStr += 'and tradeTime > '+startTime; }
        if(endTime){ queryStr += 'and tradeTime < '+endTime; }

        if(orderby && orderby.toUpperCase() =='DESC'){ queryStr += ' order by tradeTime desc ' }
        else {queryStr += ' order by tradeTime asc ' };

        logger.info('[selectFuturesSpotTradingHistory] query : '+queryStr);

        return queryPromise(queryStr);
    };

    /**
     * 비트코인 선물시세조회
     * @param {any} isUseStdDate 기준일자사용여부
     * @param {any} stdDate 기준일자
     * @returns 
     */
    sqlObj.selectFuturesLastBitCoinPriceInfo = function(isUseStdDate, stdDate){
        let queryStr = '';

        if(!isUseStdDate){
            queryStr = 'select * from futures_bitcoin_price_info ';
        }else{
            queryStr = 'select * from futures_bitcoin_price_info where time < '+stdDate;
        }

        queryStr += ' order by id desc limit 10;';

        logger.info('[selectFuturesLastBitCoinPriceInfo] query : '+queryStr);

        return queryPromise(queryStr);
    };

    /**
     * 바이낸스코인 선물시세조회
     * @param {any} isUseStdDate 기준일자사용여부
     * @param {any} stdDate 기준일자
     * @returns 
     */
    sqlObj.selectFuturesLastBnbPriceInfo = function(isUseStdDate, stdDate){
        let queryStr = '';

        if(!isUseStdDate){
            queryStr = 'select * from futures_bnb_price_info ';
        }else{
            queryStr = 'select * from futures_bnb_price_info where time < '+stdDate;
        }

        queryStr += ' order by id desc limit 10;';

        logger.info('[selectBitCoinPriceInfo] query : '+queryStr);

        return queryPromise(queryStr);
    };

    sqlObj.selectFuturesOldHistory = function(symbol, startTime, endTime, orderby){
        let queryStr = 'select * from futures_old_history where del="N" '

        if(symbol){ queryStr += 'and symbol="'+symbol+'" ' }

        if(startTime){ queryStr += ' and sellTime > '+startTime; }
        if(endTime){ queryStr += ' and sellTime < '+endTime; }

        if(orderby && orderby.toUpperCase() =='DESC'){ queryStr += ' order by sellTime desc ' }
        else { queryStr += ' order by sellTime asc ' };

        logger.info('[selectFuturesOldHistory] query : '+queryStr);

        return queryPromise(queryStr);
    };

    /**
     * 거래완료된 항목중 old_history 미기록 데이터 조회
     * @param {any} symbol 거래심볼
     * @returns 
     */
    sqlObj.selectFuturesRawOldHistory = function(symbol){
        let queryStr = 'select * from futures_raw_old_history where del="N" and isComplete="N" ';

        if(symbol){ queryStr += 'and symbol="'+symbol+'" ' }
        
        logger.info('[selectFuturesRawOldHistory] query : '+queryStr);

        return queryPromise(queryStr);
    };

    /**
     * 인컴 목록을 조회한다.
     * @param {any} symbol 거래심볼
     * @param {any} startTime [선택] 시작시간
     * @param {any} endTime [선택] 종료시간
     * @param {any} orderby [선택] 정렬구분
     * @returns 
     */
    sqlObj.selectFuturesIncomeHistory = function(symbol, startTime, endTime, orderby){
        let queryStr = 'select * from futures_income_history where del="N"  ';

        if(symbol){ queryStr += 'and symbol="'+symbol+'" ' }
        if(startTime){ queryStr += ' and time > '+startTime; }
        if(endTime){ queryStr += ' and time < '+endTime; }

        if(orderby && orderby.toUpperCase() =='DESC'){ queryStr += ' order by time desc ' }
        if(orderby && orderby.toUpperCase() =='ASC') { queryStr += ' order by time asc ' };
        
        logger.info('[selectFuturesIncomeHistory] query : '+queryStr);

        return queryPromise(queryStr);
    };

    ////////////////////////////////////////////////////////////
    // Insert
    /**
     * 선물거래 Short 데이터 삽입
     * @param {any} arr 삽입대상 데이터
     * @returns 
     */
    sqlObj.insertSbHistory = function(arr){
        const queryStr = 'INSERT INTO futures_sb_history (orderId, clientOrderId, transactTime, price, qty, buyFee, sellFee, innerAccNo, symbol, tradeType, spotProfit, spotProfitRate, del) VALUES (?);';
        let values = [];

        logger.info('[Insert_futures_sb_history] query : '+queryStr);
        
        if(arr && arr.length > 0){
            arr.forEach(el => {
                const value = [el.orderId, el.clientOrderId, el.transactTime, el.price, el.qty, el.buyFee, el.sellFee, el.innerAccNo, el.symbol, el.tradeType, el.spotProfit, el.spotProfitRate, 'N'];
                values.push(value);
            });

            logger.debug('values ==> \n'+obj2Str.objView(values));
            return queryPromise(queryStr, values);
        }
    };

    /**
     * 선물거래 포지션 청산 데이터 삽입
     * @param {any} arr 삽입대상 데이터
     * @returns 
     */
    sqlObj.insertOldHistory = function(arr){
        const queryStr = 'INSERT INTO futures_old_history (clientOrderId, descrition, buyPrice, sellPrice, sbQty, buyFee, sellFee, profit, profitRate, sellTime, innerAccNo, symbol, del) VALUES (?);';
        let values = [];

        logger.info('[Insert_futures_old_history] query : '+queryStr);

        if(arr && arr.length > 0){
            arr.forEach(el => {
                const value = [el.clientOrderId, el.descrition, el.buyPrice, el.sellPrice, el.sbQty, el.buyFee, el.sellFee, el.profit, el.profitRate, el.sellTime, el.innerAccNo, el.symbol, 'N'];
                values.push(value);
            });

            logger.debug('values ==> \n'+obj2Str.objView(values));
            return queryPromise(queryStr, values);
        }
    };

    /**
     * 선물거래 진입 포지션 데이터 삽입
     * @param {any} arr 삽입대상 데이터
     * @returns 
     */
    sqlObj.insertTradingHistory = function(arr){
        const queryStr = 'INSERT INTO futures_trading_history (tradeType, clientOrderId, sbPrice, sbQty, tradePrice, tradeQty, tradeTime, innerAccNo, symbol, del) VALUES (?);';
        let values = [];

        logger.info('[Insert_futures_trading_history] query : '+queryStr);

        if(arr && arr.length > 0){
            arr.forEach(el => {
                const value = [el.tradeType, el.clientOrderId, el.sbPrice, el.sbQty, el.tradePrice, el.tradeQty, el.tradeTime, el.innerAccNo, el.symbol, 'N'];
                values.push(value);
            });

            logger.debug('values ==> \n'+obj2Str.objView(values));
            return queryPromise(queryStr, values);
        }
    };

    /**
     * 선물거래 미 기록건 데이터 삽입
     * @param {any} arr 삽입대상 데이터
     * @returns 
     */
     sqlObj.insertRawOldHistory = function(arr){
        const queryStr = 'INSERT INTO futures_raw_old_history (clientOrderId, orderId, sbClientOrderId, sbOrderId, tradeType, transactTime, spotProfit, spotProfitRate, innerAccNo, isComplete,  symbol, del) VALUES (?);';
        let values = [];

        logger.info('[insertRawOldHistory] query : '+queryStr);

        if(arr && arr.length > 0){
            arr.forEach(el => {
                const value = [el.clientOrderId, el.orderId, el.sbClientOrderId, el.sbOrderId, el.tradeType, el.transactTime, el.spotProfit, el.spotProfitRate, el.innerAccNo, el.isComplete, el.symbol, 'N'];
                values.push(value);
            });

            logger.debug('values ==> \n'+obj2Str.objView(values));
            return queryPromise(queryStr, values);
        }
    };

    /**
     * 인컴 내역 데이터 삽입
     * @param {any}} arr 삽입대상 데이터
     * @returns 
     */
     sqlObj.insertFuturesIncomeHistory = function(arr){
        const queryStr = 
            ['INSERT INTO futures_income_history (',
            ' symbol',
            ',tranId      ',
            ',incomeType  ',
            ',income      ',
            ',asset       ',
            
            ',time        ',
            ',del         ',') VALUES (?);'].join('');

        let values = [];

        logger.info('[insertFuturesIncomeHistory] query : '+queryStr);

        if(arr && arr.length > 0){
            arr.forEach(el => {
                const value = [
                     el.symbol
                    ,el.tranId      
                    ,el.incomeType    
                    ,el.income   
                    ,el.asset        

                    ,el.time          
                    ,'N'];
                values.push(value);
            });

            logger.debug('values ==> \n'+obj2Str.objView(values));
            return queryPromise(queryStr, values);
        }
    };

    /**
     * 현물거래시, 매매시그널 건 데이터 삽입.
     * @param {any}} arr 삽입대상 데이터
     * @returns 
     */
     sqlObj.insertSpotTradingHistory = function(arr){
        const queryStr = 
            ['INSERT INTO futures_spot_trading_history (',
            ' clientOrderId',
            ',orderId      ',
            ',tradeType    ',
            ',descrition   ',
            ',price        ',
            
            ',qty          ',
            ',profit       ',
            ',profitRate   ',
            ',tradeTime    ',
            ',innerAccNo   ',
            
            ',symbol       ',
            ',isOrder      ',
            ',del          ',') VALUES (?);'].join('');

        let values = [];

        logger.info('[insertSpotTradingHistory] query : '+queryStr);

        if(arr && arr.length > 0){
            arr.forEach(el => {
                const value = [
                     el.clientOrderId
                    ,el.orderId      
                    ,el.tradeType    
                    ,el.descrition   
                    ,el.price        

                    ,el.qty          
                    ,el.profit       
                    ,el.profitRate   
                    ,el.tradeTime    
                    ,el.innerAccNo   

                    ,el.symbol       
                    ,el.isOrder                             
                    ,'N'];
                values.push(value);
            });

            logger.debug('values ==> \n'+obj2Str.objView(values));
            return queryPromise(queryStr, values);
        }
    };

    ////////////////////////////////////////////////////////////
    // Update

    ////////////////////////////////////////////////////////////
    // Delete
    /**
     * 선물 short보유 기록 삭제
     * @param {any} clientOrderId 클라이언트ID
     * @param {any} orderId  오더ID
     * @returns 
     */
    sqlObj.deleteFuturesSbHistory = function(clientOrderId, orderId){
        const queryStr = 'UPDATE futures_sb_history set del="Y" '
                       + 'where clientOrderId="'+(clientOrderId?clientOrderId:'')+'" '
                       + 'and orderId="'+(orderId?orderId:'')+'" ';

        logger.info('[deleteFuturesSbHistory] query : '+queryStr);        
        return queryPromise(queryStr);
    };

    /**
     * 현선간 정보 공유데이터 삭제
     * @param {any} clientOrderId 클라이언트ID
     * @param {any} tradeTime     거래시간
     * @returns 
     */
    sqlObj.deleteFuturesSpotTradingHistory = function(clientOrderId, tradeTime){
        const queryStr = 'UPDATE futures_spot_trading_history set isOrder="Y" '
                       + 'where clientOrderId="'+(clientOrderId ? clientOrderId:'')+'" '
                       + 'and tradeTime="'+(tradeTime ? tradeTime:'')+'" ';

        logger.info('[deleteFuturesSpotTradingHistory] query : '+queryStr);        
        return queryPromise(queryStr);
    };

    /**
     * 기록된 거래내역 Raw삭제
     * @param {any} clientOrderId 클라이언트ID
     * @param {any} orderId  거래ID
     * @returns 
     */
     sqlObj.deleteFuturesRawOldHistory = function(clientOrderId, orderId){
        const queryStr = 'UPDATE futures_raw_old_history set isComplete="Y" '
                       + 'where clientOrderId="'+(clientOrderId?clientOrderId:'')+'" '
                       + 'and orderId="'+(orderId?orderId:'')+'" ';

        logger.info('[deleteFuturesRawOldHistory] query : '+queryStr);        
        return queryPromise(queryStr);
    };

    return sqlObj;
})();