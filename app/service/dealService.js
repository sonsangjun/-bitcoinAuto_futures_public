// express setting
const express = require('express');

const router = express.Router();

const dealSetSvc = require('../service/dealSetService');
const errSvc = require('../service/errorLogService');
const logger = require('../conf/winston');

const sqlObj = require('../util/sqlUtil');
const sqlFuObj = require('../util/sql-futures');

const xhrObj = require('../util/XhrUtil');
const mailer = require('../util/emailUtil');
const CryptoJS = require('../lib/cryptoJS');
const objUtil = require('../util/objectUtil');
const jsonUtil = require('../util/jsonUtil');
const bConst = require('../util/bitConst');
const slackUtil = require('../util/slackUtil');

const schdObj = require('node-schedule');

/**
    Deal Process

    개발모드에서는 실제 거래가 이루어지지 않고,
    모의거래가 이루어진다.

    비 개발모드에서는 실제거래 API를 호출한다.
*/

module.exports = (function(){
    const jsonObj = jsonUtil.getJsonObj('dealService');

    ////////////////////////////////////////////////////////////////////////////////////////////////////
    // SHA256 생성
    /**
     * HMAC SHA256 생성
     * @param {} key 키값
     * @param {}} message Hash할메시지
     */
    function GenerateHMAC(key, message) {
        var hash = CryptoJS.HmacSHA256(message, key);
        return hash;
    }
    // SHA256 생성End
    ////////////////////////////////////////////////////////////////////////////////////////////////////

    // 값 정의 (Default값 세팅)
    let dealSet = dealSetSvc.getDefaultSet();

    // 타겟 코인의 현재가격
    let curPrice = 0;

    const isDev = objUtil.checkDevMode();
    const hrBar = '##############################################################';

    /////////////////////////////////////////////////
    // 계좌 잔고
    let accUsdt = 0;    
    let accSymbol = 0;

    let availableBalance = 0;        // 사용가능한 마진금액
    let symbolMarginBalance = 0;     // 심볼이 점유중인 마진금액

    let totalMarginBalance = 0;      // 총 마진  (총 증거금)
    let totalMaintenceMargin = 0;    // 진입마진 (진입한 포지션 증거금)

    let totalRealizeProfit = 0;
    let symbolRealizeProfit = 0;

    let totalUnrealizedProfit = 0;   // 전체미실현 손익
    let symbolUnrealizedProfit = 0;  // 심볼미실현 손익

    let totalFundingFee = 0; // 펀딩피 총합

    // 수수료는 USDT로 변환
    let feeObj = {
        bnbUsdtFee : 1,
        btcUsdtFee : 1
    };

    /////////////////////////////////////////////////
    // 스케쥴러 - 거래루틴
    let orderRoutine = null;

    const svcObj = {};
    
    svcObj.init = function(){
        return new Promise(async(resolve,reject)=>{
            try{
                await svcObj.setDealSetting();
                await svcObj.setMarginType(dealSet.symbol, dealSet.F_MarginType);
                await svcObj.setLeverage(dealSet.symbol, dealSet.F_Leverage);
                await svcObj.setExchangeInfoForSymbol();
                await svcObj.getPriceForFee();
                await svcObj.setFundingFee(dealSet.symbol);
                await sqlObj.insertSlackHistory(slackUtil.makeSlackMsgOfSingle(bConst.SLACK.TYPE.INFO, slackUtil.setSlackTitle('Server Init', true),'Success Init Server!!'));
                resolve(true);

            }catch(err){
                errSvc.insertErrorCntn(jsonObj.getMsgJson('-1',err));
                reject(jsonObj.getMsgJson('-1',err)); 
            }
        });
    };

    /**
     * 거래 서비스 기본설정 세팅
     */
     svcObj.setDealSetting = function(){
        logger.debug('setDealSetting start ==> ');

        return (new Promise((resolve,reject)=>{
            dealSetSvc.selectDealSetFromDBnEnv().then((result)=>{
                // DealSet 설정
                dealSet = result;

                ////////////////////////////////////////////////////////////////
                // 선물용 추가세팅.
                if(isDev){
                    dealSet.baseUrl = dealSet.F_TestBaseUrl;
                    dealSet.APIKey  = dealSet.F_TestAPIKey;
                    dealSet.APIPkey = dealSet.F_TestAPIPkey;
                }else{
                    dealSet.baseUrl = dealSet.F_baseUrl;
                    dealSet.APIKey  = dealSet.F_APIKey;
                    dealSet.APIPkey = dealSet.F_APIPkey;
                }

                // DB이후, .env 설정세팅
                logger.debug(['setDealSetting complete ==> (isDev:',isDev,') ',objUtil.objView(dealSet)].join(''));
                resolve(result);

            }).catch((err)=>{
                errSvc.insertErrorCntn(jsonObj.getMsgJson('-1',err));
                reject(jsonObj.getMsgJson('-1',err));
            });
        }));
    };

    /**
     * 거래루틴 시작.
     * @returns 
     */
    svcObj.run = function(){       
        if(orderRoutine){
            return logger.debug('orderRoutine is alreay running.');
        }

        logger.debug(bConst.HR);
        logger.debug('orderRoutine processing...Start');

        orderRoutine = schdObj.scheduleJob('0/'+dealSet.intervalTime+' * * * * *', svcObj.prcsOrdering);
    };

    svcObj.stopOrdering = function(){
        logger.debug('call stop Signal.');

        // 스케쥴러 중지.
        logger.debug('schd stop.');
        (orderRoutine ? orderRoutine.cancel() : null);

        orderRoutine = null;
    };

    /**
     * 거래시스템 시작.
        // 1. DB조회로 long/short대상체크
        // 2. 대상존재시 가장 옛날기록 기준으로 거래조건 맞춤
        // 3. 만족시, long/short진행.
        // 4. 콜백에 따른 데이터 DB쌓기
        // 5. 완료.

        // 추가로 확인이 필요한 사항.
        // a. 8시간마다 진행되는 funding fee 체크 (펀딩피를 쌓는 테이블이 필요하고, 테이블 데이터에 확인여부 Flag추가)
        //    또한, 펀비를 받았을 경우의 데이터도 쌓아야한다.
        // 
        // b. 청산여부.
        //    저배율로 거래하지만 (3배) 급격한 상승으로 인해 청산되는 경우가 발생할 수 있다. 
        //    (하루에 70%오른적이 있었음, 이건 물을 타고말고가 아니라 정말 청산될 수 있다. 현재 시스템은 하루 33%(3배)까지 견딜 수 있다.)

        // 필요사항
        // 선물용 DB필요. (trading_history / sb_history / old_history / )
     */
    svcObj.prcsOrdering = async function(){
        // 바이낸스 서버 점검시간인 경우 거래 중지.
        if(svcObj.checkSystemMaintain()){
            return ;
        }

        try{
            // 기본정보 조회
            await svcObj.setAccInfoFromBinance(dealSet.symbol);
            await svcObj.getPriceForFee();
            await svcObj.prcsIncomeOfFundingFee(dealSet.symbol);
                        
            const resOfPrice = await svcObj.getPriceOfSymbol(dealSet.symbol);
            const resOfSb    = await svcObj.setSbHistoryFromDB();
            const resOfOldTr = await svcObj.getOldTradingInfo(dealSet.symbol);
            const resOfRawOld= await sqlFuObj.selectFuturesRawOldHistory(dealSet.symbol);

            let resOfOrdring = {};

            // 계좌정보 로그출력
            const totalRealizeProfitJson = await svcObj.calcProfit();
            const day    = 86400*1000; // mSec
            const yesDay = Date.now()-day;
            
            curPrice = resOfPrice.price;
            lastPrice = (resOfSb[0] ? resOfSb[0].price : 0);
            totalRealizeProfit = totalRealizeProfitJson.allProfitValue;
            symbolRealizeProfit = totalRealizeProfitJson.symbolProfitValue;
            
            await svcObj.viewOldHistoryWithDB(yesDay, null, '24H');
            await svcObj.viewSbHistory(resOfSb);
            logger.debug(svcObj.viewAccountStatus(curPrice, lastPrice));

            // 미기록된 거래기록건 존재시 처리
            if(resOfRawOld && resOfRawOld.length > 0){
                logger.debug('resOfRawOld result==>',objUtil.objView(await svcObj.insOldHistory(dealSet.symbol, resOfRawOld)));
            }

            // 거래시작 -- 마진위험도 체크 ==> 마진위험도(marginRate)가 최대마진위험도에 도달시 청산처리 (가장 가격이 낮은 포지션부터 청산처리)
            if(svcObj.getMarginRate() > dealSet.F_ClearMarginRate){
                if(!(resOfSb && resOfSb.length > 0)){
                    return logger.debug(['reached maxMarginRate : ', svcObj.getMarginRate().toFixed(dealSet.floatFixed),'%',' But, empty in sbHistory'].join(''));
                }

                logger.debug(['reached maxMarginRate : ', svcObj.getMarginRate().toFixed(dealSet.floatFixed),'%',', so, start Clearing Position.==>ID:',resOfSb[resOfSb.length-1].orderId,', price',resOfSb[resOfSb.length-1].price].join(''));
                resOfOrdring = await svcObj.prcsLongOrder(dealSet.symbol, [resOfSb[resOfSb.length-1]], true);
                await sqlFuObj.deleteFuturesSbHistory(resOfOrdring.clientOrderId, resOfOrdring.orderId);
                
                return logger.debug(['success Clearing Position.==>ID:',resOfSb[resOfSb.length-1].orderId,', price',resOfSb[resOfSb.length-1].price].join(''));
            }

            // ableBalance체크, 가용할 마진이 없는 경우 --> 가장 가격이 낮은 포지션부터 청산처리
            if(!svcObj.checkAbleShort(0)){
                if(!(resOfSb && resOfSb.length > 0)){
                    return logger.debug('none ableBalanceMargin, so Clearing -->  But, empty in sbHistory');
                }
                
                logger.debug('You cannot hold a short position due to insufficient balance.');
                resOfOrdring = await svcObj.prcsLongOrder(dealSet.symbol, [resOfSb[resOfSb.length-1]], true);
                await sqlFuObj.deleteFuturesSbHistory(resOfOrdring.clientOrderId, resOfOrdring.orderId);
                
                return logger.debug(['success Clearing Position.==>ID:',resOfSb[resOfSb.length-1].orderId,', price',resOfSb[resOfSb.length-1].price].join(''));
            }

            // 거래시작 -- 일반거래
            // 처리되지 않은 L/S가 없을경우
            if(!(resOfOldTr && resOfOldTr.length > 0)){
                return logger.debug('prcsOrdering, none OldTr.');
            }

            const oldTr = resOfOldTr[0];
            const signal = oldTr.tradeType;

            logger.debug(['prcsOrdering, signal is ',signal].join(''));

            // 매매 시그널에 따른 Long/Short구분 및 진행
            if(signal==dealSet.tradeType.BUY){
                //// Buy(Long)
                resOfOrdring = await svcObj.prcsLongOrder(dealSet.symbol, resOfSb, false);
                await sqlFuObj.deleteFuturesSbHistory(resOfOrdring.clientOrderId, resOfOrdring.orderId);
                await sqlFuObj.deleteFuturesSpotTradingHistory(oldTr.clientOrderId, oldTr.tradeTime);
                
            }else if(signal==dealSet.tradeType.SELL){
                //// Sell(Short)
                resOfOrdring = await svcObj.prcsShortOrder(dealSet.symbol, oldTr);
                await sqlFuObj.deleteFuturesSpotTradingHistory(oldTr.clientOrderId, oldTr.tradeTime);

            }

        }catch(err){
            // 에러 처리
            logger.error('prcsOrder fail. '+objUtil.objView(err));
            errSvc.insertErrorCntn(jsonObj.getMsgJson('-1',err));
        }
    };

    /**
     * Binance 시스템 점검시간인지 체크
     */
    svcObj.checkSystemMaintain = function(){
        const currentTime = Date.now();
        
        if(currentTime > dealSet.systemCheck.startTime && currentTime < dealSet.systemCheck.endTime){
            logger.debug('[checkSystemMaintain] plz wait... maintain system from binance. startTime:'+dealSet.systemCheck.startTime+', endTime:'+dealSet.systemCheck.endTime);
            logger.debug('[checkSystemMaintain] cnvtTime:'+objUtil.getFullTime(dealSet.systemCheck.startTime)+'~'+objUtil.getFullTime(dealSet.systemCheck.endTime));
            errSvc.insertErrorCntn(jsonObj.getMsgJson('0','systemCheckTime. ['+objUtil.getFullTime(dealSet.systemCheck.startTime)+'~'+objUtil.getFullTime(dealSet.systemCheck.endTime)+']'));
            return true;
        }

        return false;
    };

    /**
     * (symbol기준) 코인가중치에(coinWeight) 따른 잔여현금액 
     */
    svcObj.getExtraAccUsdt = function(){
        const extraAcc = accUsdt * svcObj.getCurrentWeight();

        if(extraAcc <= 0){
            return 0;
        }

        return extraAcc;
    };

    /**
     * 타켓 코인한정 총자산 평가액
     */
    svcObj.getEvaluateAssetWithCoin = function(){
        return svcObj.getEvalueateAsset() * svcObj.getCurrentWeight();
    };

    /**
     * 총자산 평가액구하기
     */
    svcObj.getEvalueateAsset = function(){
        return (accUsdt + symbolUnrealizedProfit);
    };

    /**
     * 현재 코인의 자산가중치 구하기
     */
    svcObj.getCurrentWeight = function(){
        return (dealSet.coinPrice.weight/100);
    };

    /**
     * 계좌잔고Symbol가져오기
     */
    svcObj.getHavingcoin = function(){        
        return accSymbol;
    };

    /**
     * 계좌잔고조회 - 바이낸스
     * 
     * response
     *  {
     *      "feeTier": 0,       // account commisssion tier 
     *      "canTrade": true,   // if can trade
     *      "canDeposit": true,     // if can transfer in asset
     *      "canWithdraw": true,    // if can transfer out asset
     *      "updateTime": 0,
     *      "totalInitialMargin": "0.00000000",    // total initial margin required with current mark price (useless with isolated positions), only for USDT asset
     *      "totalMaintMargin": "0.00000000",     // total maintenance margin required, only for USDT asset
     *      "totalWalletBalance": "23.72469206",     // total wallet balance, only for USDT asset
     *      "totalUnrealizedProfit": "0.00000000",   // total unrealized profit, only for USDT asset
     *      "totalMarginBalance": "23.72469206",     // total margin balance, only for USDT asset
     *      "totalPositionInitialMargin": "0.00000000",    // initial margin required for positions with current mark price, only for USDT asset
     *      "totalOpenOrderInitialMargin": "0.00000000",   // initial margin required for open orders with current mark price, only for USDT asset
     *      "totalCrossWalletBalance": "23.72469206",      // crossed wallet balance, only for USDT asset
     *      "totalCrossUnPnl": "0.00000000",      // unrealized profit of crossed positions, only for USDT asset
     *      "availableBalance": "23.72469206",       // available balance, only for USDT asset
     *      "maxWithdrawAmount": "23.72469206"     // maximum amount for transfer out, only for USDT asset
     *      "assets": [
     *          {
     *              "asset": "USDT",            // asset name
     *              "walletBalance": "23.72469206",      // wallet balance
     *              "unrealizedProfit": "0.00000000",    // unrealized profit
     *              "marginBalance": "23.72469206",      // margin balance
     *              "maintMargin": "0.00000000",        // maintenance margin required
     *              "initialMargin": "0.00000000",    // total initial margin required with current mark price 
     *              "positionInitialMargin": "0.00000000",    //initial margin required for positions with current mark price
     *              "openOrderInitialMargin": "0.00000000",   // initial margin required for open orders with current mark price
     *              "crossWalletBalance": "23.72469206",      // crossed wallet balance
     *              "crossUnPnl": "0.00000000"       // unrealized profit of crossed positions
     *              "availableBalance": "23.72469206",       // available balance
     *              "maxWithdrawAmount": "23.72469206"     // maximum amount for transfer out
     *          },
     *          {
     *              "asset": "BUSD",            // asset name
     *              "walletBalance": "103.12345678",      // wallet balance
     *              "unrealizedProfit": "0.00000000",    // unrealized profit
     *              "marginBalance": "103.12345678",      // margin balance
     *              "maintMargin": "0.00000000",        // maintenance margin required
     *              "initialMargin": "0.00000000",    // total initial margin required with current mark price 
     *              "positionInitialMargin": "0.00000000",    //initial margin required for positions with current mark price
     *              "openOrderInitialMargin": "0.00000000",   // initial margin required for open orders with current mark price
     *              "crossWalletBalance": "103.12345678",      // crossed wallet balance
     *              "crossUnPnl": "0.00000000"       // unrealized profit of crossed positions
     *              "availableBalance": "103.12345678",       // available balance
     *              "maxWithdrawAmount": "103.12345678"     // maximum amount for transfer out
     *          }
     *      ],
     *      "positions": [  // positions of all sumbols in the market are returned
     *          // only "BOTH" positions will be returned with One-way mode
     *          // only "LONG" and "SHORT" positions will be returned with Hedge mode
     *          {
     *              "symbol": "BTCUSDT",    // symbol name
     *              "initialMargin": "0",   // initial margin required with current mark price 
     *              "maintMargin": "0",     // maintenance margin required
     *              "unrealizedProfit": "0.00000000",  // unrealized profit
     *              "positionInitialMargin": "0",      // initial margin required for positions with current mark price
     *              "openOrderInitialMargin": "0",     // initial margin required for open orders with current mark price
     *              "leverage": "100",      // current initial leverage
     *              "isolated": true,       // if the position is isolated
     *              "entryPrice": "0.00000",    // average entry price
     *              "maxNotional": "250000",    // maximum available notional with current leverage
     *              "positionSide": "BOTH",     // position side
     *              "positionAmt": "0"          // position amount
     *          }
     *      ]
     *  }
     * 
     * positions 잔고가 있는경우.
     *  entryPrice: "59266.36000"
     *  initialMargin: "79.35017333"
     *  isolated: false
     *  isolatedWallet: "0"
     *  leverage: "3"
     *  maintMargin: "0.95220208"
     *  maxNotional: "200000000"
     *  notional: "-238.05052000"
     *  openOrderInitialMargin: "0"
     *  positionAmt: "-0.004"
     *  positionInitialMargin: "79.35017333"
     *  positionSide: "BOTH"
     *  symbol: "BTCUSDT"
     *  unrealizedProfit: "-0.98508000"
     */
     svcObj.setAccInfoFromBinance = function(symbol){
        logger.debug('setAccInfoFromBinance start ==> ',symbol);

        return (new Promise( async (resolve,reject)=>{
            // 조회전 symbol 체크
            if(!symbol){
                return reject('It have to symbol.');
            }

            // 선물은 testNet에서 가상매매 가능, 동일하게 로직적용
            try{
                const result = await svcObj.getAccountFromBinance(symbol);

                if(!result || (result && result.length < 1)){
                    return reject('cant read accInfo From binance');
                }

                const accInfo = { };
                accInfo['USDT'] = 0;
                accInfo[symbol] = 0;
                accInfo['Other'] = 0;

                const assets = result.assets;
                const positions = result.positions;
                
                let index=0;
                let loopObj = null;

                // 선물 asset 계산 (현물의 balance.free)
                for(index=0; index<assets.length; index++){
                    loopObj = assets[index];

                    if(loopObj.asset=='USDT'){
                        accInfo['USDT'] += parseFloat(loopObj.walletBalance); 
                    }
                }

                // 선물 position 계산 (현물의 coin)
                for(index=0; index<positions.length; index++){
                    loopObj = positions[index];

                    if(loopObj.symbol == symbol){
                        accInfo[symbol] += parseFloat(loopObj.positionAmt); 
                        symbolUnrealizedProfit = Number(loopObj.unrealizedProfit); 
                        symbolMarginBalance = Number(loopObj.positionInitialMargin);
                    }else{
                        accInfo['Other'] += Number(loopObj.positionInitialMargin);
                    }
                }

                // 계좌세팅
                logger.debug('setAccInfoFromBinance accInfo: '+objUtil.objView(accInfo));
                accSymbol = accInfo[symbol];
                accUsdt = accInfo['USDT'];
                accOtherSymbolUsdt = accInfo['Other'];
                totalUnrealizedProfit = Number(result.totalUnrealizedProfit);   // 전체미실현 손익    
                availableBalance = Number(result.availableBalance);

                totalMarginBalance = Number(result.totalMarginBalance);    // 총 마진  (총 증거금)
                totalMaintenceMargin = Number(result.totalMaintMargin);    // 진입마진 (진입한 포지션 증거금)

                logger.info('setAccInfoFromBinance complete ==> symbol: '+symbol.replace('USDT','')+' '+accInfo[symbol]+', USDT: '+accInfo['USDT']);
                resolve(result);

            }catch(err){
                const errJsonMsg = jsonObj.getMsgJson('-1',err);
                const finalErrMsg = jsonObj.getMsgJson(errJsonMsg.code, '[setAccInfoFromBinance]'+errJsonMsg.msg);
                errSvc.insertErrorCntn(finalErrMsg);
                reject(finalErrMsg);
            }
        }));
    };

    /**
     * 바이낸스로부터 선물 계좌잔고(Json) 가져오기
     */
    svcObj.getAccountFromBinance = function(){
        const timingObj = svcObj.getTimingSec();
        const rawParam = 'recvWindow='+timingObj.recvWindow+'&timestamp='+timingObj.timestamp;
        const url = dealSet.baseUrl+'/fapi/v2/account';
        const header = svcObj.getXhrHeader();

        const signatureStr = GenerateHMAC(dealSet.APIPkey,rawParam);
        const finalParam = rawParam + '&signature=' + signatureStr;

        logger.debug('getAccountFromBinance. finalParam: '+finalParam);
        return xhrObj.xhrGet(url,finalParam,header);
    };

    /**
     * DB로부터 거래가 완료되지 않은 목록 조회
     */
    svcObj.setSbHistoryFromDB = function(){
        logger.debug('setSbHistoryFromDB start ==> ');

        return (new Promise((resolve,reject)=>{
            sqlFuObj.selectFuturesSbHistory(dealSet.symbol).then((result)=>{

                if(!result || (result && result.length < 1)){
                    logger.debug('selectFuturesSbHistory result empty');
                    sbHistory = [];
                }else{
                    sbHistory = result;
                }
    
                logger.debug('setSbHistoryFromDB complete ==> ');
                resolve(result);

            }).catch((err)=>{
                errSvc.insertErrorCntn(jsonObj.getMsgJson('-1',err));
                reject(jsonObj.getMsgJson('-1',err));
            });
        }));
    };

    /**
     * sbHistory 간소화 json생성
     */
    svcObj.simpleSbHistory = function(resOfSb){
        const arr = resOfSb;
        let modiArr = [];

        arr.forEach((obj)=>{
            let modiObj = {};
            modiObj.iNo = obj.innerAccNo;
            modiObj.t = obj.tradeType;
            modiObj.kTime = ''.concat(objUtil.getYYYYMMDD(obj.transactTime),'.',objUtil.getHHMMSS(obj.transactTime));
            modiObj.q = obj.qty;
            modiObj.pos= (modiObj.t == 'S' ? (-1)*obj.qty : obj.qty);
            modiObj.p = obj.price;
            modiObj.cID = obj.clientOrderId;
            modiObj.pfr = obj.spotProfitRate;

            modiArr.push(modiObj);
        });

        return modiArr;
    },

    /**
     * 현재 보유중인 포지션 목록 출력
     * 
     * 많을 수 있어 최근 10건만 출력하게 변경
     */
    svcObj.viewSbHistory = function(resOfSb){
        return new Promise(async(resolve, reject)=>{
            try{
                const arr = svcObj.simpleSbHistory(resOfSb);
                const maxCnt = 10; // 최대출력건수
                
                let arrStr = '';

                let totPos = 0;
                let totQty = 0;
                let totAmt = 0;
                let avgP = 0;
                let hNlRate = 0;
        
                let maxPrice = 0;
                let minPrice = 0;
        
                
                arr.forEach((obj, idx)=>{
                    if(idx===0){
                        maxPrice = obj.p;
                    }else if(idx === (arr.length-1)){
                        minPrice = obj.p;
                    }
        
                    if(idx < maxCnt){
                        arrStr += (JSON.stringify(obj,null,0)).replace(/\"/g,'') + '\n';
                    }
                    
                    totPos += obj.pos;
                    totQty += obj.q;
                    totAmt += obj.q * obj.p;
                });
        
                if(arr.length > 10){
                    arrStr += ['...(Omitted below, ',(arr.length - maxCnt),' more.)\n'].join('');
                }
        
                avgP = totAmt/totQty;

                if(arr.length > 1){
                    hNlRate = (100*((minPrice / maxPrice)-1));
                    hNlRate = (String(hNlRate) === 'NaN' ? 0 : hNlRate);
                }else{
                    hNlRate = 0;
                }
        
                logger.debug(
                     hrBar + '\n'
                    +'## viewSbHistory. length: '+arr.length 
                    +', totPosQty:'+totPos.toFixed(dealSet.floatFixed)
                    +', totQty:'+totQty.toFixed(dealSet.floatFixed)
                    +', totAmt: '+totAmt.toFixed(dealSet.floatFixed)
                    +', avgP: '+(avgP).toFixed(dealSet.floatFixed)
                    +', curP: '+(curPrice).toFixed(dealSet.floatFixed)
                    +', avgRate: '+(100*(1-(avgP/curPrice))).toFixed(dealSet.floatFixed) + '%'
                    +', hNLRate: '+(hNlRate).toFixed(dealSet.floatFixed) + '%'
                    +'\n'+arrStr
                );

                resolve(jsonObj.getMsgJson('0','viewSbHistory success.'));

            }catch(err){
                resolve(jsonObj.getMsgJson('-1',err));
            }
        });
    };

    /**
     * 마진 위험도 계산 (%)
     * 
     * (진입마진 / 총마진)
     * 
     * CROSSED는 100%되면 바이낸스에서 전부청산처리한다.
     */
    svcObj.getMarginRate = function(){
        if(totalMarginBalance <= 0){
            return 0;
        }

        return (totalMaintenceMargin / totalMarginBalance) * 100;
    };

    /**
     * 현재계좌상황 Log출력
     * @returns 
     */
    svcObj.viewAccountStatus = function(curPrice, lastPrice){
        const evalAcc = svcObj.getEvalueateAsset();
        const detailPad = 14;
        const titlePad = 10;
        const _fundingFee = (totalFundingFee ? totalFundingFee : 0);
        const _symEvalRate = (symbolMarginBalance ? (symbolUnrealizedProfit/symbolMarginBalance) : 0);

        const _totalPf = (symbolRealizeProfit + _fundingFee + symbolUnrealizedProfit).toFixed(dealSet.floatFixed);

        return ([
            '\n', bConst.HR
           ,'\n','[', 'TotalCurAccoutInfo, Unit:$]'                   
           ,'\n',' ',('Init').padEnd(titlePad,' ')                  ,': ' , dealSet.initAccUsdt.toFixed(dealSet.floatFixed).padEnd(detailPad,' ')                ,', ',('AbleMagin').padEnd(titlePad,' ')      ,': ' , availableBalance.toFixed(dealSet.floatFixed).padEnd(detailPad,' ')
           ,'\n',' ',('TotRPF').padEnd(titlePad,' ')                ,': ' , totalRealizeProfit.toFixed(dealSet.floatFixed).padEnd(detailPad,' ')                 ,', ',('TotRPF(%)').padEnd(titlePad,' ') ,': ' , [((100*(totalRealizeProfit)/dealSet.initAccUsdt).toFixed(dealSet.floatFixed)),'%'].join('').padEnd(detailPad,' ') , ', ', ('TotUnReal').padEnd(titlePad,' ') ,': ' , totalUnrealizedProfit.toFixed(dealSet.floatFixed).padEnd(detailPad,' ') 
           ,'\n',' ',('TotMaint').padEnd(titlePad,' ')              ,': ' , totalMaintenceMargin.toFixed(dealSet.floatFixed).padEnd(detailPad,' ')               ,', ',('TotBanlce').padEnd(titlePad,' ') ,': ' , totalMarginBalance.toFixed(dealSet.floatFixed).padEnd(detailPad,' ')                                              , ', ', ('MaginRate').padEnd(titlePad,' ') ,': ' , [svcObj.getMarginRate().toFixed(dealSet.viewFixed),'% / ',dealSet.F_ClearMarginRate.toFixed(dealSet.viewFixed),'%'].join('').padEnd(detailPad,' ')
           ,'\n',' '
           ,'\n', bConst.HR
           ,'\n','[', 'SymbolCurAccoutInfo, TargetCoin: '+dealSet.symbol+', Unit: $, marginType: ',dealSet.F_MarginType,', leverage: ',dealSet.F_Leverage,', F_PR: ',dealSet.F_PositionRate,'%]'           
           ,'\n',' ',('pos(coin)').padEnd(titlePad,' ') ,': ',svcObj.getHavingcoin().toFixed(dealSet.floatFixed).padEnd(detailPad,' '),                                          ', ' , ('PosAmt').padEnd(titlePad,' ') , ': ', (symbolMarginBalance*dealSet.F_Leverage).toFixed(dealSet.floatFixed)
           ,'\n',' ',('AbleMagin').padEnd(titlePad,' ')                ,': ' , (availableBalance * svcObj.getCurrentWeight()).toFixed(dealSet.floatFixed).padEnd(detailPad,' ') ,', ' , ('symMagin').padEnd(titlePad,' ') , ': ', symbolMarginBalance.toFixed(dealSet.floatFixed).padEnd(detailPad,' ')
                                   
           ,(lastPrice ? ['\n',' ',('PreBuy').padEnd(titlePad,' ')  ,': ',(lastPrice.toFixed(dealSet.floatFixed)).padEnd(detailPad,' ')                         ,', ',('curPrice').padEnd(titlePad,' ')  ,': ' ,(curPrice.toFixed(dealSet.floatFixed)).padEnd(detailPad,' ')                                                       ,', ',('PGapRate').padEnd(titlePad,' ')  ,': ',[(((curPrice-lastPrice)/lastPrice)*100).toFixed(dealSet.floatFixed),'%'].join('').padEnd(detailPad,' ')].join('') 
                       : ['\n',' ',('curPrice').padEnd(titlePad,' ') ,': ' , (curPrice).toFixed(dealSet.floatFixed)].join('')
            )
                                   
            ,'\n',' ',('FundFeePf').padEnd(titlePad,' '), ': ', _fundingFee.toFixed(dealSet.floatFixed).padEnd(detailPad,' ') , ', ',('TotEvPf').padEnd(titlePad,' ')                 ,': ',((symbolUnrealizedProfit+_fundingFee).toFixed(dealSet.floatFixed)).padEnd(detailPad,' ')            ,', ',('TotEvPf(%)').padEnd(titlePad,' ') , ': ', [(_symEvalRate).toFixed(dealSet.floatFixed),'%'].join('').padEnd(detailPad,' ')
            ,'\n',' ',('TRealPf').padEnd(titlePad,' ')    ,': ' ,(symbolRealizeProfit.toFixed(dealSet.floatFixed)).padEnd(detailPad,' ')                                            ,', ',('TRealPf(%)').padEnd(titlePad,' ') ,': ',[(100*(symbolRealizeProfit)/(dealSet.initAccUsdt*svcObj.getCurrentWeight())).toFixed(dealSet.floatFixed),'%'].join('').padEnd(detailPad,' ')
            ,'\n', bConst.HR
            ,'\n',' ',('TotalPf').padEnd(titlePad,' ')    ,': ' ,_totalPf.padEnd(detailPad,' ')                                            ,', ',('TotalPf(%)').padEnd(titlePad,' ') ,': ',[(100*(_totalPf)/(dealSet.initAccUsdt*svcObj.getCurrentWeight())).toFixed(dealSet.floatFixed),'%'].join('').padEnd(detailPad,' '),'\n'
        ].join(''));
    };

    svcObj.viewOldHistoryWithDB = async function(start, end, title){
        try {
            const result = await sqlFuObj.selectFuturesOldHistory(dealSet.symbol, start, end, 'desc');
            logger.debug('viewOldHistoryWithDB select result.length :' + result.length);

            const innerFixed = 1;
            const maxCnt = 10;

            let totQty = 0;
            let totProfit = 0;

            let totalMsg = hrBar + '\n'
                + '[' + title + ', PreOrderHistory]\n'
                + '[iNo,  Desc,  ClearTime,        Price(B/S,$)(%),          Qty      Profit($)]\n';

            if (result.length > 0) {
                result.forEach((obj,idx) => {
                    totQty += obj.sbQty;
                    totProfit += obj.profit;

                    if(idx < maxCnt){
                        totalMsg += '[' + obj.innerAccNo + ', ' + obj.descrition + ', '.concat(objUtil.getYYYYMMDD(obj.sellTime), '.', objUtil.getHHMMSS(obj.sellTime)) + ']: '
                            + obj.buyPrice.toFixed(innerFixed) + '/' + obj.sellPrice.toFixed(innerFixed) + '(' + obj.profitRate.toFixed(dealSet.floatFixed) + '), ' + obj.sbQty.toFixed(dealSet.floatFixed) + ', ' + obj.profit + '\n';
                    }
                });
            }

            if(result.length > maxCnt){
                totalMsg += ['...(Omitted below, ',(result.length-maxCnt),' more.)\n'].join('');
            }

            logger.debug(totalMsg);
            logger.debug('totQty:' + totQty.toFixed(dealSet.floatFixed) + ', totProfit:' + totProfit.toFixed(dealSet.floatFixed));
            return await (new Promise((resolve, reject) => { resolve(result); }));
        } catch (err) {
            logger.error('viewOldHistoryWithDB fail, ' + err);
            errSvc.insertErrorCntn(jsonObj.getMsgJson('-1', err));
            return await (new Promise((resolve_1, reject_1) => { reject_1(jsonObj.getMsgJson('-1', err)); }));
        }
    };

    /**
     * Long/Short이 처리되지 않은 거래중, 가장 오래된 거래조회(단건)
     */
    svcObj.getOldTradingInfo = function(symbol){
        return new Promise(async (resolve, reject)=>{
            try{
                const res = await sqlFuObj.selectFuturesSpotTradingHistory(symbol);
                resolve(res);
            }catch(e){
                reject(null);
            }
        });
    };

    /**
     * 롱 Order 처리
     * @param {any} symbol 거래심볼
     * @param {any} resOfSb 진입포지션 목록
     * @param {any} isClearing 위험도에 따른 청산거래여부
     * @returns 
     */
    svcObj.prcsLongOrder = function(symbol, resOfSb, isClearing){
        return new Promise(async(resolve, reject)=>{
            // 잔여 Short 확인
            try{
                let msg = '';                           

                // 잔여 Short이 없는 경우.
                if(!(resOfSb && resOfSb.length > 0)){
                    return reject(jsonObj.getMsgJson('0','target short empty.'));    
                }

                // 잔여 Short이 있는 경우.
                const lowPriceSb = resOfSb[0];
                const stdProfitRate = lowPriceSb.spotProfitRate;
                const quantity = lowPriceSb.qty;
                const clientOrderId = lowPriceSb.clientOrderId;
                const orderId = lowPriceSb.orderId;
                const innerAccNo = lowPriceSb.innerAccNo;

                const side = dealSet.order.BUY;
                const tradeType = dealSet.tradeType.BUY;

                // Short 수익률계산이므로 부호반전(-) 처리
                const stdPrice = lowPriceSb.price;
                const curProfitRate = (-1)*(((curPrice-stdPrice)/stdPrice)*100).toFixed(dealSet.floatFixed);

                // 현재가격대비 현물수익 * 레버리지보다 높은지체크
                if(!isClearing){
                    if(!(curProfitRate > stdProfitRate)){
                        msg = {code : '0', msg : ['dont reach goal shortProfitRate. std:',stdProfitRate,', cur:',curProfitRate].join('')}
                        logger.debug(objUtil.objView(msg));
                        return resolve(msg);
                    }
                }

                // 높다면 Long으로 Short청산처리
                // 거래완료후 주요거래기록(DB작업)은 거래루틴에서 작업
                const resOfOrder = await svcObj.callOrder(symbol, side, 'MARKET', quantity);

                await svcObj.insRawOldHistory(
                    resOfOrder.clientOrderId, 
                    resOfOrder.orderId,
                    clientOrderId,
                    orderId,
                    tradeType,
                    resOfOrder.updateTime,
                    0,
                    0,
                    innerAccNo                    
                );

                resolve({code : '0', msg : 'prcsOrder-Long success.', clientOrderId : clientOrderId, orderId : orderId });

            }catch(err){
                errSvc.insertErrorCntn(jsonObj.getMsgJson('-1',err));
                reject(jsonObj.getMsgJson('-1',err));
            }
        });
    };

    /**
     * 롱 거래내역 DB저장
     * @param {any} rawOldInfo  미기록 거래내역
     * @param {any} resOfTrList 바이낸스 거래내역 목록
     * @returns 
     */
    svcObj.insLongInfo = function(rawOldInfo, resOfTrList){
        return new Promise(async (resolve, reject)=>{
            try{
                const resOfSb = await sqlFuObj.selectPastFuturesSbHistory(dealSet.symbol, dealSet.tradeType.SELL, rawOldInfo.sbClientOrderId, rawOldInfo.sbOrderId);

                let targetTrList = svcObj.getTargetTrList(rawOldInfo, resOfTrList);
                let oldHistoryJson = {};
                let tradeJson = svcObj.tradingHistoryJson();
    
                const buyFee      = svcObj.getOrderFee(targetTrList);
                const price       = svcObj.getAvgPrice(targetTrList);
                const qty         = svcObj.getTotalQty(targetTrList);
    
                if(targetTrList.length < 1){
                    return resolve({code : '0', msg : '(Long) not match binanceTrList. OrderId:'+rawOldInfo.orderId});
                }

                if(resOfSb.length < 1){
                    return reject({code : '0', msg : '(Long) not match pastSbHistory. sbOrderId:'+rawOldInfo.sbOrderId});
                }

                const pastSbInfo = resOfSb[0];

                // binance는 평균단가기준으로 실현손익을 산정하므로, 자체적으로 개별단가기준으로 실현손익 산정함.
                // const realizedPnl = svcObj.getTotalRealizedPnl(targetTrList);
                const realizedPnl = (pastSbInfo.price - price)*(qty);
                const profit = Number(realizedPnl).toFixed(dealSet.floatFixed);
                const profitRate = ((realizedPnl / (pastSbInfo.price * qty))*100).toFixed(dealSet.floatFixed);
    
                // old_history 세팅
                oldHistoryJson.clientOrderId = rawOldInfo.clientOrderId;
                oldHistoryJson.descrition    = dealSet.sellType.GENERAL;
                oldHistoryJson.buyPrice      = price;
                oldHistoryJson.sellPrice     = pastSbInfo.price;
                oldHistoryJson.sbQty         = qty;
                oldHistoryJson.buyFee        = buyFee;
                oldHistoryJson.sellFee       = pastSbInfo.sellFee;
                oldHistoryJson.profit        = profit;
                oldHistoryJson.profitRate    = profitRate;
                oldHistoryJson.sellTime      = rawOldInfo.transactTime;
                oldHistoryJson.innerAccNo    = rawOldInfo.innerAccNo;
                oldHistoryJson.symbol        = dealSet.symbol;
    
                // trading_history 세팅
                tradeJson.tradeType = rawOldInfo.tradeType;
                tradeJson.clientOrderId = rawOldInfo.clientOrderId;
                tradeJson.sbPrice = price;
                tradeJson.sbQty = qty;
                tradeJson.tradePrice = price;
                tradeJson.tradeQty = qty;
                tradeJson.tradeTime = rawOldInfo.transactTime;
                tradeJson.symbol = dealSet.symbol;
                tradeJson.innerAccNo = rawOldInfo.innerAccNo;
    
                await sqlFuObj.insertTradingHistory([tradeJson]);                
                await sqlFuObj.insertOldHistory([oldHistoryJson]);
    
                await sqlObj.insertSlackHistory(
                    slackUtil.makeSlackMsgOfSingle(bConst.SLACK.TYPE.ORDER, slackUtil.setSlackTitle('Long Coin', true), 
                    slackUtil.setSlackMsgOfOrderLong(oldHistoryJson, pastSbInfo))
                );
    
                return resolve({code : '0', msg : 'success (Long)-insertOrderHistory OrderId:'+rawOldInfo.orderId});
            }catch(err){
                errSvc.insertErrorCntn(jsonObj.getMsgJson('-1',err));
                reject(jsonObj.getMsgJson('-1',err));
            }
        });
    };

    /**
     * 숏 Order 처리
     * @param {any} symbol 거래심볼 
     * @param {any} oldTr 현물 거래내역
     * @returns 
     */
    svcObj.prcsShortOrder = function(symbol, oldTr){
        return new Promise(async (resolve, reject)=>{
            try{
                const minRatio = 2;     // 필터 최소배율.
                const shortAmt = (oldTr.price * oldTr.qty) * (dealSet.F_Leverage * dealSet.F_PositionRate * 0.01); // 포지션 크기

                const spotProfit = oldTr.profit
                const spotProfitRate = oldTr.profitRate;
                const descrition = oldTr.descrition;
    
                const clientOrderId = oldTr.clientOrderId;
                const orderId = oldTr.orderId;

                const tradeTime = oldTr.tradeTime;
                const side = dealSet.order.SELL;

                const innerAccNo = oldTr.innerAccNo;
                
                // 수량 & 금액은 거래소 필터 불만족시 재산정
                const minNotional = svcObj.getExchangeInfoOfKey('MIN_NOTIONAL');
                const lotSize = svcObj.getExchangeInfoOfKey('LOT_SIZE');
                let orderAmt = shortAmt;
                let quantity = svcObj.calcStdQuantity(curPrice, orderAmt);
                let msg = '';                

                logger.debug(['prcsShortOrder Orgin-OrderInfo ==>','orderAmt',orderAmt,'quantity',quantity]);

                // 거래소 최소금액 체크. (최소금액을 하회하면 최소금액의 2배만큼 세팅)
                if(orderAmt <= minNotional){
                    logger.debug('prcsShortOrder, amount is very small. increate amount.');
                    orderAmt = minNotional * minRatio;
                    quantity = svcObj.calcStdQuantity(curPrice, orderAmt);
                }
    
                // 수량이 필터보다 작은경우, 거래소 필터의 최소 수량의 2배로 세팅.
                if(quantity <= lotSize){
                    logger.debug('prcsShortOrder, qty is very small. increate qty.');
                    orderAmt = (curPrice * lotSize * minRatio);
                    quantity = svcObj.calcStdQuantity(curPrice, orderAmt);                    
                }

                logger.debug(['prcsShortOrder fixed-OrderInfo ==>','orderAmt',orderAmt,'quantity',quantity]);
                
                // Short이 가능한지 잔고체크(잔고없으면 거래안함.)
                if(!svcObj.checkAbleShort(orderAmt)){
                    (()=>{
                        const errMsg = 'You cannot hold a short position due to insufficient balance.';
                        errSvc.insertErrorCntn(jsonObj.getMsgJson('-1',errMsg));
                        return resolve(jsonObj.getMsgJson('0',errMsg));    
                    })();
                }
    
                // 현물 청산건은 거래안함.
                if(descrition === dealSet.sellType.CLEARING){
                    msg = 'This is clearing Sell. dont have a short position, This order Status set Completing.';
                    await sqlFuObj.deleteFuturesSpotTradingHistory(clientOrderId, tradeTime);
                    return resolve(jsonObj.getMsgJson('0',errMsg));    
                }
    
                // 일반 매도인 경우.
                // 거래완료후 주요거래기록(DB작업)은 거래루틴에서 작업
                const resOfOrder = await svcObj.callOrder(symbol, side, 'MARKET', quantity);

                await svcObj.insRawOldHistory(
                    resOfOrder.clientOrderId, 
                    resOfOrder.orderId,
                    clientOrderId,
                    orderId,
                    dealSet.tradeType.SELL,
                    resOfOrder.updateTime,
                    spotProfit,
                    spotProfitRate,
                    innerAccNo                    
                );
                
                resolve({code : '0', msg : 'prcsOrder-Short success.', clientOrderId : clientOrderId, orderId : orderId });

            }catch(err){
                errSvc.insertErrorCntn(jsonObj.getMsgJson('-1',err));
                reject(jsonObj.getMsgJson('-1',err));
            }
        });
    };

    /**
     * Futures_sbHistory 템플릿
     */
    svcObj.sbHistoryJson = function(){
        return {
            orderId : 0,
            clientOrderId : 0,
            transactTime : 0,
            price : 0,
            qty : 0,
            buyFee : 0,
            sellFee : 0,
            symbol : ''
        };
    };

    /**
     * 매매체결JSON
     * sbPrice : 단가
     * sbQty : 수량 
     * tradePrice : 체결단가
     * tradeQty : 체결수량
     * tradeTime : 체결시간(타임스탬프)
     * type : 체결종류(S,B)
     * id : 주문ID(임시로 Timestamp, 향후 바이낸스가 제공한 ID로변경할 것)
     */
     svcObj.tradingHistoryJson = function(){
        return {
            tradeType : '',                
            clientOrderId : '',
            sbPrice : 0, 
            sbQty : 0,
            tradePrice : 0,
            tradeQty : 0,
            tradeTime : ''
        }
    };

    /**
     * 바이낸스 선물 거래내역 조회
     * 
     * response
     * [
        {
            "buyer": false,
            "commission": "-0.07819010",
            "commissionAsset": "USDT",
            "id": 698759,
            "maker": false,
            "orderId": 25851813,
            "price": "7819.01",
            "qty": "0.002",
            "quoteQty": "15.63802",
            "realizedPnl": "-0.91539999",
            "side": "SELL",
            "positionSide": "SHORT",
            "symbol": "BTCUSDT",
            "time": 1569514978020
        }
        ]
     * @param {any} symbol 거래심볼
     * @param {any} startTime 시작시간
     * @param {any} endTime 종료시간
     * @returns 
     */
    svcObj.getTradingListFromBinance = function(symbol, startTime, endTime){
        const timingObj = svcObj.getTimingSec();

        const interval = 60000; // 60초 이내 거래목록 조회
        const _endTime = (endTime ? endTime : Date.now());
        const _startTime = (startTime ? startTime : (_endTime - interval)) ;

        const rawParam = 'symbol='+symbol+'&startTime='+_startTime+'&endTime'+_endTime+'&recvWindow='+timingObj.recvWindow+'&timestamp='+timingObj.timestamp;
        const url = dealSet.baseUrl+'/fapi/v1/userTrades';
        const header = svcObj.getXhrHeader();

        const signatureStr = GenerateHMAC(dealSet.APIPkey,rawParam);
        const finalParam = rawParam + '&signature=' + signatureStr;

        logger.debug('getTradingListFromBinance. finalParam: '+finalParam);
        return xhrObj.xhrGet(url,finalParam,header);
    }

    /**
     * 거래완료후, 거래기록 작성을 위해 Marking처리
     * @param {any} clientOrderId    [필수] 현 거래 ClientId
     * @param {any} orderId          [필수] 현 거래 OrderId
     * @param {any} sbClientOrderId  [필수] 전 거래 ClientId
     * @param {any} sbOrderId        [필수] 전 거래 OrderId
     * @param {any} tradeType        [필수] 거래타입
     * @param {any} transactTime     [필수] 거래시간
     * @param {any} spotProfit       [선택] 현물 손익금 (Short경우만 작성한다.)
     * @param {any} spotProfitRate   [선택] 현물 손익률 (Short경우만 작성한다.) 
     * @param {any} innerAccNo       [필수] 내부계좌번호
     * @returns 
     */
    svcObj.insRawOldHistory = async function(clientOrderId, orderId, sbClientOrderId, sbOrderId, tradeType, transactTime, spotProfit, spotProfitRate, innerAccNo){
        const param = {
            clientOrderId   : clientOrderId, 
            orderId         : orderId, 
            sbClientOrderId : sbClientOrderId, 
            sbOrderId       : sbOrderId, 
            tradeType       : tradeType,
            transactTime    : transactTime,
            spotProfit      : (spotProfit ? spotProfit : 0), 
            spotProfitRate  : (spotProfitRate ? spotProfitRate : 0),
            innerAccNo      : innerAccNo,
            isComplete      : 'N',
            symbol          : dealSet.symbol
        };

        let res = {};

        try{
            res = await sqlFuObj.insertRawOldHistory([param]);
            logger.debug('insRawOldHistory result==>'+objUtil.objView(res));
        }catch(err){
            res = jsonObj.getMsgJson('-1',err)
            errSvc.insertErrorCntn(res);
        }

        return res;
    };

    /**
     * 미기록 거래건 기록처리
     * @param {any} rawOldHistory 미기록된 거래기록건
     * @returns 
     */
    svcObj.insOldHistory = function(symbol, rawOldHistory){
        return new Promise(async (resolve, reject)=>{
            if(!rawOldHistory || rawOldHistory.length < 1){
                return resolve({code : '0', msg:'empty rawOldHistory.'});
            }

            try{
                const len = rawOldHistory.length;
                const resOfTrList = await svcObj.getTradingListFromBinance(symbol);
                let index=0;
                let loopObj = {};
    
                for(index=0; index<len; index++){
                    loopObj = rawOldHistory[index];

                    if(loopObj.tradeType == dealSet.tradeType.BUY){
                        await svcObj.insLongInfo(loopObj, resOfTrList);
                        await sqlFuObj.deleteFuturesRawOldHistory(loopObj.clientOrderId, loopObj.orderId);
                        
                    }else if(loopObj.tradeType == dealSet.tradeType.SELL){
                        await svcObj.insShortInfo(loopObj, resOfTrList);
                        await sqlFuObj.deleteFuturesRawOldHistory(loopObj.clientOrderId, loopObj.orderId);
    
                    }
                }

                return resolve({code : '0', msg:'insOldHistory success.'});

            }catch(err){
                errSvc.insertErrorCntn(jsonObj.getMsgJson('-1',err));
                reject(jsonObj.getMsgJson('-1',err)); 
            }
        });
    };

    /**
     * clientId와 일치하는 거래내역 목록 반환
     * @param {any} rawOldInfo 미기록 거래내역
     * @param {any} resOfTrList 바이낸스 거래내역 목록
     */
    svcObj.getTargetTrList = function(rawOldInfo, resOfTrList){
        const orderId = rawOldInfo.orderId;
        let targetTrList = [];

        resOfTrList.forEach((obj)=>{
            if(obj.orderId == orderId){
                targetTrList.push(obj);
            }
        });

        return targetTrList;
    };

    /**
     * 숏 거래내역 DB저장
     * @param {any} rawOldInfo  미기록 거래내역
     * @param {any} resOfTrList 바이낸스 거래내역 목록
     * @returns 
     */
     svcObj.insShortInfo = function(rawOldInfo, resOfTrList){
        return new Promise(async (resolve, reject)=>{
            try{
                let targetTrList = svcObj.getTargetTrList(rawOldInfo, resOfTrList);
                let sbHistoryJson = svcObj.sbHistoryJson();
                let tradeJson = svcObj.tradingHistoryJson();
                
                const sellFee = svcObj.getOrderFee(targetTrList);
                const price   = svcObj.getAvgPrice(targetTrList);
                const qty     = svcObj.getTotalQty(targetTrList);

                if(targetTrList.length < 1){
                    return resolve({code : '0', msg : '(Short) not match binanceTrList. OrderId:'+rawOldInfo.orderId});
                }
    
                // sb_history 세팅
                sbHistoryJson.orderId = rawOldInfo.orderId;
                sbHistoryJson.clientOrderId = rawOldInfo.clientOrderId;
                sbHistoryJson.transactTime = rawOldInfo.transactTime;
                sbHistoryJson.price = price;
                sbHistoryJson.qty = qty;
                sbHistoryJson.sellFee = sellFee;
                sbHistoryJson.symbol = dealSet.symbol;

                sbHistoryJson.tradeType = rawOldInfo.tradeType;
                sbHistoryJson.spotProfit = rawOldInfo.spotProfit;
                sbHistoryJson.spotProfitRate = rawOldInfo.spotProfitRate;
    
                // trading_history 세팅
                tradeJson.tradeType = rawOldInfo.tradeType;
                tradeJson.clientOrderId = rawOldInfo.clientOrderId;
                tradeJson.sbPrice = price;
                tradeJson.sbQty = qty;
                tradeJson.tradePrice = price;
                tradeJson.tradeQty = qty;
                tradeJson.tradeTime = rawOldInfo.transactTime;
                tradeJson.symbol = dealSet.symbol;
            
                // 내부계좌번호                 
                tradeJson.innerAccNo = rawOldInfo.innerAccNo;
                sbHistoryJson.innerAccNo = rawOldInfo.innerAccNo;
    
                // DB 기록
                await sqlFuObj.insertSbHistory([sbHistoryJson]);
                await sqlFuObj.insertTradingHistory([tradeJson]);                
                
                await sqlObj.insertSlackHistory(
                    slackUtil.makeSlackMsgOfSingle(bConst.SLACK.TYPE.ORDER, slackUtil.setSlackTitle('Short Coin', true), 
                    slackUtil.setSlackMsgOfOrderShort(sbHistoryJson))
                );

                return resolve({code : '0', msg : 'success (Short)-insertOrderHistory OrderId:'+rawOldInfo.orderId});
                
            }catch(err){
                errSvc.insertErrorCntn(jsonObj.getMsgJson('-1',err));
                reject(jsonObj.getMsgJson('-1',err));
            }
        });
    };


    /**
     * Short 가능여부 체크
     * 
     * 선물의 레버리지 설정을 포함하여 계산한다.
     * 
     * ex. Leverage : 3 / Price : 333 / Qty : 0.01 
     *     (333 * 0.01)/3 < 당신의 amount금액
     * 
     *     Leverage가 클수록 포지션 설정시 필요 마진이 작아진다.
     *     (그만큼, 쥐똥만큼 움직이면 청산빔~!)
     * 
     * @param {any} amount 매입금액(USDT)
     * @returns 
     */
    svcObj.checkAbleShort = function(amount){
        return ( availableBalance > ((amount/dealSet.F_Leverage) * 1.05));
    };

    /**
     * 수량 산정
     * 
     * 거래소 필터를 만족하는 수량을 산정
     * @param {any} price 매매가격
     */
    svcObj.calcStdQuantity = function(price, amount){
        logger.debug('calcStdQuantity call');
        const lotStepSize = svcObj.getLotStepLength();

        const quantity = String(amount / price ).substr(0, dealSet.exchangeInfo.baseAssetPrecision); // 주문수량
        
        if(svcObj.getFloatSize(quantity) < 1){
            return quantity;
        }
        
        // 소수점 존재시, lotStepSize 조건맞춤
        return svcObj.cnvtLotStepSize(quantity);
    };

    /**
     * 주문수량의 유효소숫점 자리수를 반환한다.
     * 
     * @returns 소수점 스텝 갯수
     */
    svcObj.getLotStepLength = function(){
        let lotStepSize = '';
        dealSet.exchangeInfo.filters.forEach((obj)=>{
            switch(obj.filterType){
                case 'LOT_SIZE' : lotStepSize = obj.stepSize; break;
                default : break;
            }
        });

        let cnt=0;
        let max=100;
        
        while(cnt < max){
            const num = parseFloat(lotStepSize * Math.pow(10,cnt));
            if(num >= 1){ break; }
            
            cnt++;
        }

        logger.debug('getStepLength cnt : '+cnt);
        return cnt;
    };

    /**
     * 뒤 소수점 자리 갯수 계산
     */
     svcObj.getFloatSize = function(fl){
        const splitDot = String(fl).split('.');

        if(splitDot.length < 1){
            return 0;
        }else if(!splitDot[1]){
            return 0;
        }

        return String(splitDot[1]).length;
    };

    /**
     * lotStepSize를 거래소 필터에 맞게 맞춰줌.
     * @param {any} quantity Raw수량
     */
    svcObj.cnvtLotStepSize = function(quantity){
        // lotStepSize 조건맞춤
        const lotStepSize = svcObj.getLotStepLength();
        const splitDot = String(quantity).split('.');
        return (splitDot[0] +'.'+ splitDot[1].substr(0,lotStepSize));
    };

    /**
     * 필터 키에 해당하는 값을 반환한다.
     * 
     * 대표적인 키 종류
     * MIN_NOTIONAL : 최소금액
     * LOT_SIZE     : 최소수량
     * 
     * ex. svcObj.getExchangeInfoOfKey('LOT_SIZE') ==> 10
     * @param {any} key 필터 키값
     */
    svcObj.getExchangeInfoOfKey = function(key){
        let filterValue = '';

        dealSet.exchangeInfo.filters.forEach((obj)=>{
            if(obj.filterType === key){
                switch(obj.filterType){
                    case 'LOT_SIZE' : filterValue = obj.minQty; break;
                    case 'MIN_NOTIONAL' : filterValue = (obj.minNotional ? obj.minNotional : obj.notional); break;
                    default : break;
                }
            }
        });
        
        return (filterValue ? filterValue : '');
    };

    /**
     * 지급된 펀딩피를 조회 및 DB에 삽입한다. 
     * @param {*} symbol 
     */
    svcObj.prcsIncomeOfFundingFee = function(symbol, startTime, endTime){
        return new Promise(async (resolve, reject)=>{
            try{
                const timingObj = svcObj.getTimingSec();
                const incomeType = 'FUNDING_FEE';
                const interval = 60000; // 60초 이내 거래목록 조회
                const _endTime = (endTime ? endTime : Date.now());
                const _startTime = (startTime ? startTime : (_endTime - interval)) ;

                const rawParam = 
                    'symbol='+symbol+
                    '&incomeType='+incomeType+
                    '&startTime='+_startTime+
                    '&endTime='+_endTime+
                    '&recvWindow='+timingObj.recvWindow+
                    '&timestamp='+timingObj.timestamp;

                const url = dealSet.baseUrl+'/fapi/v1/income';
                const header = svcObj.getXhrHeader();
        
                const signatureStr = GenerateHMAC(dealSet.APIPkey,rawParam);
                const finalParam = rawParam + '&signature=' + signatureStr;
        
                logger.debug('prcsIncomeOfFundingFee. finalParam: '+finalParam);
                const resOfIncome = await xhrObj.xhrGet(url,finalParam,header);
                resolve(await svcObj.insIncomeOfFundingFee(resOfIncome));

            }catch(err){
                (()=>{
                    const errJson = jsonObj.getMsgJson('-1',err);
                    logger.error(['prcsIncomeOfFundingFee',errJson.msg]);
                    resolve(errJson);
                })();
            }
        });
    };

    /**
     * 바이낸스 조회 인컴 목록중 FundingFee를 DB에 삽입한다.
     * 새로운 목록 존재시, setFundingFee를 통해 전역변수 설정한다.
     * @param {any} resOfIncome 바이낸스 조회 인컴 목록
     * @returns 
     */
    svcObj.insIncomeOfFundingFee = function(resOfIncome){
        return new Promise(async (resolve, reject)=>{
            try{
                if(!resOfIncome){
                    return resolve({code : '0', msg : 'prcsIncomeOfFundingFee is empty.'});
                }

                const incomeType = 'FUNDING_FEE';
                const len = resOfIncome.length;
                let index=0;
                let _obj = {};
                let el = {};

                for(index=0; index<len; index++){
                    _obj = resOfIncome[index];
                    el = {};

                    if(_obj.incomeType == incomeType){
                         el.symbol     = dealSet.symbol
                        ,el.tranId     = _obj.tranId
                        ,el.incomeType = _obj.incomeType
                        ,el.income     = _obj.income
                        ,el.asset      = _obj.asset
                        ,el.time       = _obj.time

                        await sqlFuObj.insertFuturesIncomeHistory([el]);
                        await svcObj.setFundingFee(dealSet.symbol);
                        await sqlObj.insertSlackHistory(
                            slackUtil.makeSlackMsgOfSingle(
                                bConst.SLACK.TYPE.INFO, 
                                slackUtil.setSlackTitle('fundingFee income', true),
                                ['incomeType:',_obj.incomeType,'\nasset:',_obj.asset,'\nfee:',_obj.income,'\nTotalFee:',totalFundingFee].join('')
                            )
                        );
                    }
                }

                logger.debug('prcsIncomeOfFundingFee. success length:'+resOfIncome.length);
                resolve({code : '0'});

            }catch(err){
                (()=>{
                    const msg = jsonObj.getMsgJson('-1',err);
                    logger.error(['prcsIncomeOfFundingFee',msg.msg]);
                    resolve(errJson);
                })();
            }
        });
    };

    /**
     * DB로부터 펀딩피 총합계를 조회한다.
     * @param {any}} symbol 거래심볼
     */
    svcObj.selectFundingFee = function(symbol){
        return new Promise(async(resolve, reject)=>{
            let totalFee = 0;
            try{
                const resOfIncome = await sqlFuObj.selectFuturesIncomeHistory(symbol);
    
                resOfIncome.forEach((obj)=>{
                    if(obj.incomeType == 'FUNDING_FEE'){
                        if(obj.asset == 'USDT') {
                            totalFee += parseFloat(obj.income);
                        }else if(obj.asset == 'BNB') {
                            totalFee += parseFloat(obj.income * feeObj.bnbUsdtFee);
                        }else if(obj.asset == 'BTC') {
                            totalFee += parseFloat(obj.income * feeObj.btcUsdtFee);
                        }
                    }
                });
            }catch(err){
                (()=>{
                    const errJson = jsonObj.getMsgJson('-1',err);
                    logger.error(['prcsIncomeOfFundingFee',errJson.msg]);
                });
            }finally{
                resolve(totalFee);
            }
        });
    };

    /**
     * 총 펀딩피 전역변수값 설정
     * @param {any} symbol 거래심볼
     * @returns 
     */
    svcObj.setFundingFee = function(symbol){
        return new Promise(async (resolve, reject)=>{
            try{
                const resOfIncome = await svcObj.selectFundingFee(symbol);
                totalFundingFee = resOfIncome;
                resolve({code : '0', msg : 'setFundingFee success.'});

            }catch(err){
                logger.error(['prcsIncomeOfFundingFee',errJson.msg]);
                totalFundingFee = 0;

                resolve({code : '-1' , msg : objUtil.objView(err)});
            }
        });
    }
  
    /**
     * 매매시 수수료 계산 (리턴단위 USDT) (바이낸스 거래내역기준)
     * @param {array} fills  바이낸스 거래내역
     */
    svcObj.getOrderFee = function(fills){
        let totalFee = 0; // 단위 BTC

        fills.forEach((obj)=>{
            if(obj.commissionAsset == 'USDT') {
                totalFee += parseFloat(obj.commission);
            }else if(obj.commissionAsset == 'BNB') {
                totalFee += parseFloat(obj.commission * feeObj.bnbUsdtFee);
            }else if(obj.commissionAsset == 'BTC') {
                totalFee += parseFloat(obj.commission * feeObj.btcUsdtFee);
            }
        });

        logger.debug('getOrderFee fills ==>'+objUtil.objView(fills));
        logger.debug('getOrderFee totFee(USDT) ==>'+totalFee);
        return totalFee;
    };

    /**
     * 매매시 평균단가 계산 (바이낸스 거래내역기준)
     * @param {array} fills  바이낸스 거래내역
     */
     svcObj.getAvgPrice = function(fills){
        let totalQty = 0; 
        let totalAmt = 0; 
        let avgPrice = 0;

        fills.forEach((obj)=>{
            totalQty += Number(obj.qty);
            totalAmt += (obj.qty * obj.price);
        });

        try{
            avgPrice = totalAmt / totalQty;
        }catch(err){
            logger.debug('getAvgPrice error:'+objUtil.objView(err));
        }

        logger.debug(['getAvgPrice ==>',avgPrice,', qty:',totalQty,', amt:',totalAmt].join(''));
        return avgPrice;
    };

    /**
     * 매매시 총수량 계산 (바이낸스 거래내역기준)
     * @param {array} fills 바이낸스 거래내역
     */
     svcObj.getTotalQty = function(fills){
        let totalQty = 0; 

        fills.forEach((obj)=>{
            totalQty += Number(obj.qty);
        });

        logger.debug(['getAvgPrice ==> qty:',totalQty].join(''));
        return totalQty;
    };

    /**
     * 매매시 총 실현손익 계산 (바이낸스 거래내역기준)
     * @param {array} fills 바이낸스 거래내역
     */
     svcObj.getTotalRealizedPnl = function(fills){
        let totalRealizedPnl = 0; 

        fills.forEach((obj)=>{
            totalRealizedPnl += Number(obj.realizedPnl);
        });

        logger.debug(['getTotalRealizedPnl ==> totalRealizedPnl:',totalRealizedPnl].join(''));
        return totalRealizedPnl;
    };

    /**
     * 선물거래 레버리지를 설정한다.
     * @param {any} leverage 레버리지 값 (정수)
     * @returns 
     */
    svcObj.setLeverage = function(symbol, leverage){
        const timingObj = svcObj.getTimingSec();
        let rawParam = '';
        let url = dealSet.baseUrl+'/fapi/v1/leverage';

        rawParam = 
        'symbol='+symbol+'&'
        +'leverage='+leverage+'&'
        +'recvWindow='+timingObj.recvWindow+'&'
        +'timestamp='+timingObj.timestamp;

        const header = svcObj.getXhrHeader();

        const signatureStr = GenerateHMAC(dealSet.APIPkey, rawParam);
        const finalParam = rawParam + '&signature=' + signatureStr;

        logger.debug('setLeverage. finalParam: '+finalParam);
        return xhrObj.xhrPost(url, finalParam, header);
    };

    /**
     * 마진타입을 선택한다. (교차/격리)
     * 
     * code : -4046 (마진타입 바꿀필요없다.)
     * @param {any} marginType 마진구분코드
     * @returns 
     */
     svcObj.setMarginType = function(symbol, marginType){
        const timingObj = svcObj.getTimingSec();
        let rawParam = '';
        let url = dealSet.baseUrl+'/fapi/v1/marginType';

        rawParam = 
        'symbol='+symbol+'&'
        +'marginType='+marginType+'&'
        +'recvWindow='+timingObj.recvWindow+'&'
        +'timestamp='+timingObj.timestamp;

        const header = svcObj.getXhrHeader();

        const signatureStr = GenerateHMAC(dealSet.APIPkey, rawParam);
        const finalParam = rawParam + '&signature=' + signatureStr;

        logger.debug('setMarginType. finalParam: '+finalParam);
        
        return new Promise(async(resolve, reject)=>{
            try{
                const res = await xhrObj.xhrPost(url, finalParam, header);
                resolve(res);
            }catch(err){
                if(err.code == '-4046'){
                    return resolve(err);
                }

                reject(err);
            }
        });
    };

    /**
     * 시장가 거래시, 평균가격 산출
     * @param {array} fills 체결내역
     */
     svcObj.getAvgPriceInFills = function(fills){
        if(fills && fills.length > 0){
            let totVolum = 0;
            let totQty = 0;

            fills.forEach((obj)=>{
                totVolum += (obj.price * obj.qty);
                totQty += parseFloat(obj.qty);
            });

            return parseFloat(totVolum/totQty);
        }

        return 0;
    };

    /**
     * 수수료 계산을 위해 
     */
    svcObj.getPriceForFee = function(){
        return (new Promise((resolve, reject)=>{                
            svcObj.getPriceOfSymbol(bConst.TRADE_SYMBOL_USDT.BTC).then(function(result){
                feeObj.btcUsdtFee = result.price;
                return svcObj.getPriceOfSymbol(bConst.TRADE_SYMBOL_USDT.BNB)
                
            }).then(function(result){
                feeObj.bnbUsdtFee = result.price;

                logger.debug('getPriceForFee[btc:'+feeObj.btcUsdtFee+', bnb:'+feeObj.bnbUsdtFee+']');
                resolve(jsonObj.getMsgJson('0','getPriceForFee success'));

            }).catch(function(err){
                logger.error('getPriceForFee. '+objUtil.objView(err));
                errSvc.insertErrorCntn(jsonObj.getMsgJson('-1','[getPriceForFee]'+objUtil.objView(err)));
                reject(jsonObj.getMsgJson('-1',err));
            });
        }
        ));
    },
    
    /**
     * 매매시 수수료 계산 (리턴단위 USDT)
     * @param {array} fills 
     */
    svcObj.getOrderFee = function(fills){
        let totalFee = 0; // 단위 BTC

        fills.forEach((obj)=>{
            if(obj.commissionAsset == 'USDT') {
                totalFee += parseFloat(obj.commission);
            }else if(obj.commissionAsset == 'BNB') {
                totalFee += parseFloat(obj.commission * feeObj.bnbUsdtFee);
            }else if(obj.commissionAsset == 'BTC') {
                totalFee += parseFloat(obj.commission * feeObj.btcUsdtFee);
            }
        });

        logger.debug('getOrderFee fills ==>'+objUtil.objView(fills));
        logger.debug('getOrderFee totFee(USDT) ==>'+totalFee);
        return totalFee;
    },

    /**
     * [심볼]에 해당하는 코인 평균가격구하기
     * ==> getTradeInfo로 변경 (avgPrice API가 불안정함.)
     * 
     * 반환값 {price : 평균값}
     * 
     * symbol예시, (BNBUSDT, BTCUSDT 만 가능)
     * EX. response ==> 0: {id: 524771888, price: "23607.09000000", qty: "0.00600000", quoteQty: "141.64254000", time: 1608879705112, …}
     * @param {any} symbol 심볼
     */
    svcObj.getPriceOfSymbol = function(symbol){
        return (new Promise((resolve, reject)=>{
            let tSymbol = (symbol ? symbol : dealSet.symbol);
            svcObj.getTradeInfo(tSymbol).then(function(result){
                if(result && result.length > 0){
                    const len = result.length;
                    let totVal = 0;
                    
                    result.forEach((obj)=>{
                        totVal += parseFloat(obj.price);
                    });

                    const avgVal = parseFloat(totVal/len);
                    resolve({price : avgVal});
                }else{
                    reject({'code':'-1', 'msg':'getTradeInfo result empty.'});
                }
            }).catch(function(err){
                errSvc.insertErrorCntn(jsonObj.getMsgJson('-1',err));
                reject(jsonObj.getMsgJson('-1',err));
            });
        }))
    },

    /**
     * 최근거래기록
     * 
     * success시, arguments[0]이 Json배열형태로 넘어옴
     * 0: {id: 524771888, price: "23607.09000000", qty: "0.00600000", quoteQty: "141.64254000", time: 1608879705112, …}
     * fail시, arguments[0].responseText 출력
     * 
     * (21.02.10) 시세조회 docker를 따로 분리하고, 
     * 데이터는 DB에서 조회
     * 
     * ex. const orderParam = 'symbol=BTCUSDT&limit=20';
     * 
     * @param {any} symbol 거래통화 심볼
     * @param {any} limit 조회 호가수
     */
    svcObj.getTradeInfo = function(symbol){
        switch(symbol){
            case bConst.TRADE_SYMBOL_USDT.BTC : return sqlFuObj.selectFuturesLastBitCoinPriceInfo();
            case bConst.TRADE_SYMBOL_USDT.BNB : return sqlFuObj.selectFuturesLastBnbPriceInfo();
            default : return (new Promise((resolve, reject)=>reject(jsonObj.getMsgJson('-1','symbol is empty.'))));
        }
    };

    /**
     * 모든 심볼에 대한 총 순손익금 계산
     */
    svcObj.calcProfit = async function(){
        let allProfitValue = 0;     // 총   순손익금
        let symbolProfitValue = 0;  // 심볼 순손익금

        try{
            const allProfitList = await sqlFuObj.selectFuturesOldHistory();
    
            // 모든 매매 손익계산
            if((allProfitList && allProfitList.length > 0)){
                allProfitList.forEach((obj)=>{
                    allProfitValue += (obj.profit - obj.buyFee - obj.sellFee);

                    if(dealSet.symbol === obj.symbol){
                        symbolProfitValue += (obj.profit - obj.buyFee - obj.sellFee);
                    }
                });
            }          

        }catch(err){
            errSvc.insertErrorCntn(jsonObj.getMsgJson('-1',err));
        }
        
        return {
            allProfitValue : allProfitValue,
            symbolProfitValue : symbolProfitValue
        };
    };

    /**
     * 거래소에서 정보 조회후 필터세팅 (symbol만)
     */
    svcObj.setExchangeInfoForSymbol = function(){
        logger.debug('setExchangeInfoForSymbol start ==> ');

        return (new Promise((resolve,reject)=>{
            svcObj.getExchangeInfo().then(function(result){
                dealSet.exchangeInfo = null;

                if(!dealSet.symbol){
                    return reject('[setExchangeInfoForSymbol] have to symbol!');
                }

                result.symbols.forEach((obj)=>{
                    if(obj.symbol === dealSet.symbol){
                        logger.debug('obj : '+objUtil.objView(obj));
                        dealSet.exchangeInfo = obj;
                    }
                });

                if(!dealSet.exchangeInfo){
                    return reject('[setExchangeInfoForSymbol] no matched symbol!');
                }

                logger.debug('setExchangeInfoForSymbol complete ==> ');
                resolve(true);

            }).catch(function(err){
                errSvc.insertErrorCntn(jsonObj.getMsgJson('-1',err));
                reject(jsonObj.getMsgJson('-1',err));
            })
        }));
    };

    /**
     * 거래소 정보 가져오기
     * 
     * LOT_SIZE, MIN_NOTIONAL 등등 필터조건이 필요하다.
     * 
     * response
     * 
     * {
            "exchangeFilters": [],
            "rateLimits": [
                {
                    "interval": "MINUTE",
                    "intervalNum": 1,
                    "limit": 2400,
                    "rateLimitType": "REQUEST_WEIGHT" 
                },
                {
                    "interval": "MINUTE",
                    "intervalNum": 1,
                    "limit": 1200,
                    "rateLimitType": "ORDERS"
                }
            ],
            "serverTime": 1565613908500, 
            "symbols": [
                {
                    "symbol": "BLZUSDT",
                    "pair": "BLZUSDT",
                    "contractType": "PERPETUAL",
                    "deliveryDate": 4133404800000,
                    "onboardDate": 1598252400000,
                    "status": "TRADING",
                    "maintMarginPercent": "2.5000",   // ignore
                    "requiredMarginPercent": "5.0000",  // ignore
                    "baseAsset": "BLZ", 
                    "quoteAsset": "USDT",
                    "marginAsset": "USDT",
                    "pricePrecision": 5,
                    "quantityPrecision": 0,
                    "baseAssetPrecision": 8,
                    "quotePrecision": 8, 
                    "underlyingType": "COIN",
                    "underlyingSubType": ["STORAGE"],
                    "settlePlan": 0,
                    "triggerProtect": "0.15", // threshold for algo order with "priceProtect"
                    "filters": [
                        {
                            "filterType": "PRICE_FILTER",
                            "maxPrice": "300",
                            "minPrice": "0.0001", 
                            "tickSize": "0.0001"
                        },
                        {
                            "filterType": "LOT_SIZE", 
                            "maxQty": "10000000",
                            "minQty": "1",
                            "stepSize": "1"
                        },
                        {
                            "filterType": "MARKET_LOT_SIZE",
                            "maxQty": "590119",
                            "minQty": "1",
                            "stepSize": "1"
                        },
                        {
                            "filterType": "MAX_NUM_ORDERS",
                            "limit": 200
                        },
                        {
                            "filterType": "MAX_NUM_ALGO_ORDERS",
                            "limit": 100
                        },
                        {
                            "filterType": "MIN_NOTIONAL",
                            "notional": "1", 
                        },
                        {
                            "filterType": "PERCENT_PRICE",
                            "multiplierUp": "1.1500",
                            "multiplierDown": "0.8500",
                            "multiplierDecimal": 4
                        }
                    ],
                    "OrderType": [
                        "LIMIT",
                        "MARKET",
                        "STOP",
                        "STOP_MARKET",
                        "TAKE_PROFIT",
                        "TAKE_PROFIT_MARKET",
                        "TRAILING_STOP_MARKET" 
                    ],
                    "timeInForce": [
                        "GTC", 
                        "IOC", 
                        "FOK", 
                        "GTX" 
                    ]
                }
            ],
            "timezone": "UTC" 
        }
     * 
     */
    svcObj.getExchangeInfo = function(){
        const finalParam = '';
        const url = dealSet.baseUrl+'/fapi/v1/exchangeInfo';

        return xhrObj.xhrGet(url,finalParam);
    };

    /////////////////////////////////////////////////////////////////////////
    // Order
    /**
     * * 주문 요청
     * (param : newOrderRespType (주문응답타입) MARKET은 Default가 FULL이다.
     * 
     * response
     * {"orderId":142452220,"symbol":"BNBUSDT","status":"NEW","clientOrderId":"cwfkuVd2QIEb7U82RDENDH","price":"0","avgPrice":"0.00000","origQty":"50","executedQty":"0","cumQty":"0","cumQuote":"0","timeInForce":"GTC","type":"MARKET","reduceOnly":false,"closePosition":false,"side":"BUY","positionSide":"BOTH","stopPrice":"0","workingType":"CONTRACT_PRICE","priceProtect":false,"origType":"MARKET","updateTime":1617456626362}
     * 
     * 아무리 수량이 많아도 한줄만 반환한다.
     * 다만, trading히스토리 까보면 orderId에 여러개의 내역이 있다.
     * @param {any} symbol (필수)심볼(암호화폐이름)
     * @param {any} side (필수)BUY/SELL
     * @param {any} type (필수)LIMIT/MARKET
     * @param {*} quantity (필수)수량
     * @param {*} price 가격
     * @param {any} timeInForce GTC/IOC/FOK
     */
     svcObj.callOrder = function(symbol, side, type, quantity, price, timeInForce){
        const timingObj = svcObj.getTimingSec();
        let rawParam = '';
        let url = dealSet.baseUrl+'/fapi/v1/order';

        if(type==='MARKET'){
            if(!(symbol && side && type && quantity)){
                logger.error(symbol+', '+ side+', '+ type+', '+ quantity);
                return(new Promise((resolve,reject)=>{ reject('insufficient param For MarketType')}));
            }

            rawParam = 
            'symbol='+symbol+'&'
            +'side='+side+'&'
            +'type='+type+'&'
            +'quantity='+quantity+'&'
            +'recvWindow='+timingObj.recvWindow+'&'
            +'timestamp='+timingObj.timestamp;

        }else if(type==='LIMIT'){
            if(!(symbol && side && type && quantity && price && timeInForce)){
                logger.error(symbol+', '+ side+', '+ type+', '+ quantity +', '+ price+', '+ timeInForce);
                return(new Promise((resolve,reject)=>{ reject('insufficient param For LIMIT')}));
            }

            rawParam = 
            'symbol='+symbol+'&'
            +'side='+side+'&'
            +'type='+type+'&'
            +'timeInForce='+timeInForce+'&'
            +'quantity='+quantity+'&'
            +'price='+price+'&'
            +'recvWindow='+timingObj.recvWindow+'&'
            +'timestamp='+timingObj.timestamp;

        }else{
            return(new Promise((resolve,reject)=>{ reject('orderType is empty')}));
        }
        
        const header = svcObj.getXhrHeader();

        const signatureStr = GenerateHMAC(dealSet.APIPkey, rawParam);
        const finalParam = rawParam + '&signature=' + signatureStr;

        logger.debug('callOrder. finalParam: '+finalParam);
        return xhrObj.xhrPost(url, finalParam, header);
    };

    /////////////////////////////////////////////////////////////////////////
    // Xhr
    /**
     * 타이밍 설정
     * 
     * 타이밍 관한 내용은 아래를 따른다.
     * 
     * if  ( timestamp  <  ( serverTime  +  1000 )  &&  ( serverTime  -  timestamp ) <= recvWindow )  { 
     * // 요청 처리 
     * }  else  { 
     * // 요청 거부 
     * 
     * timestamp는 serverTime + 1000 보다 작으면서
     * serverTime - timestamp 는 recvWindow보다 작거나 같아야한다.
     * 
     * 서버타임이 클라보다 느리다는 전제하에 recvWindow차이이내로 나야한다.
     * 
     */
    svcObj.getTimingSec = function(){
        const recvWindow = dealSet.recvWindow; 
        const timestampLong = (new Date()).getTime();
        const offsetTimeStr = timestampLong ;

        return{
            recvWindow : recvWindow,
            timestamp : offsetTimeStr
        };
    };

    /**
     * xhr헤더 설정(APIKey)
     */
     svcObj.getXhrHeader = function(){
        return {
            'X-MBX-APIKEY' : dealSet.APIKey
        };
    };

    return svcObj;
})();
