const objUtil = require('../util/objectUtil');
const logger = require('../conf/winston');
const sqlObj = require('../util/sqlUtil');
const sqlFuObj = require('../util/sql-futures');

const jsonUtil = require('../util/jsonUtil');
const dealSetSvc = require('../service/dealSetService');

const bConst = require('../util/bitConst');

module.exports = (function(){
    ///////////////////////////////////////////////////////////////////
    // Init Area
    const jsonObj = jsonUtil.getJsonObj('staticsService');

    let svcObj = {};
    let isInit = false;
    let dealSet = dealSetSvc.getDefaultSet();

    /**
     * staticsService 초기화(외부용.)
     */
    svcObj.initDealSet = function(){
        svcObj._initDealSet()
        .then(()=>logger.debug('staticsService initDealSet success.'))
        .catch((err)=>logger.debug('staticsService initDealSet fail.'+objUtil.objView(err)));
    };
    
    /**
     * * staticsService 초기화(내부용.)
     */
    svcObj._initDealSet = function(){
        return (new Promise((resolve, reject)=>{
            dealSetSvc.selectDealSetFromDBnEnv()
            .then(function(result){
                dealSet = result;
                isInit = true;
                resolve(jsonObj.getMsgJson('0','initDealSet success.'));

            }).catch(function(err){
               reject(jsonObj.getMsgJson('-1',err));
            });
        }));
    };

    /**
     * 초기화 여부 체크 및 미 초기화시 초기화 진행
     */
    svcObj.checkInit = function(){
        if(!isInit){
            logger.debug('checkInit[isInit]: false');
            return false;
        }

        logger.debug('checkInit[isInit]: true');
        return true;
    };
    // Init Area
    ///////////////////////////////////////////////////////////////////

    ////////////////////////////////////////////////////////////////////////////////////////////////////
    // Select
    ////////////////////////////////////////////////////////////////////////////////////////////////////
    svcObj.selectNetIncome = function(symbol, starttime, endtime, dateType, detailfixed, isFutures){
        return new Promise(async (resolve, reject)=>{
            try{
                const fixedNumber = (objUtil.parseValue(detailfixed) ? dealSet.floatFixed : dealSet.viewFixed); logger.debug('fixedNumber:'+fixedNumber+', detailfixed:'+detailfixed);
                const cnvtDateType = String(dateType).toUpperCase();
    
                let dayNetIncome = [];

                if(isFutures){
                    dayNetIncome = await svcObj.selectNetIncomeOfDayFutures(symbol, starttime, endtime, fixedNumber);
                }else{
                    dayNetIncome = await svcObj.selectNetIncomeOfDaySpot(symbol, starttime, endtime, fixedNumber);
                }
    
                switch(cnvtDateType){
                    case bConst.DATE_TYPE.MON : return resolve(svcObj.cnvtDayNetIncome2Month(starttime, dayNetIncome, fixedNumber));
                    default : return resolve(dayNetIncome);
                }
            }catch(e){
                return reject(jsonObj.getMsgJson('-1','selectNetIncome fail. '+objUtil.objView(e)));
            }
        });
    };

    /**
     * 일단위 수익데이터를 월단위로 변환
     * 
     * return json구조
     * "orderDate",   : 날짜(YYYYMMDD)      
     * "profit",      : 수익금
     * "buyFee",      : 매수_수수료
     * "sellFee",     : 매도_수수료
     * "totalFee",    : 총_수수료
     * "netIncome",   : 수수료차감_순수익
     * "orderCnt",    : 거래횟수
     * "feeRate",     : 수익금대비_수수료비율
     * "prfRate",     : 원금대비_수익률
     * "accVolumn",   : 원금
     * "cuIncomeSum", : 총_순수익금
     * "weightProfit" : 원금대비_가중수익률
     * "pastDay"      : 투자기간
     * "dayComInRate" : 일평균복리수익률
     *  capMonPrfRate : 누적수익금포함_월수익률
     * 
     * @param {any} dayNetIncome 일단위 계산된 수익데이터
     */
    svcObj.cnvtDayNetIncome2Month = function(starttime, dayNetIncome, fixedNumber){
        if(!dayNetIncome){
            return {};
        }

        let monthNetIncome = [];
        let preOrderDate = '';

        // 말일자 데이터 추출
        dayNetIncome.forEach((obj, idx)=>{
            if(idx<1){
                // 최초일자 체크
                preOrderDate = objUtil.cnvtYYYYMMDD2YYYYMM(obj.orderDate);

            }else{
                // 말일자데이터인지 체크
                if(preOrderDate !== objUtil.cnvtYYYYMMDD2YYYYMM(obj.orderDate)){
                    preOrderDate = objUtil.cnvtYYYYMMDD2YYYYMM(obj.orderDate);
                    monthNetIncome.push(Object.assign({},dayNetIncome[idx-1]));
                }

                // 최종일자 체크
                if(idx === (dayNetIncome.length-1)){
                    monthNetIncome.push(Object.assign({},obj));
                } 
            }
        });

        monthNetIncome.forEach((obj,idx)=>{
            const monStr = objUtil.cnvtYYYYMMDD2YYYYMM(obj.orderDate);
            
            obj.profit = 0.0;
            obj.buyFee = 0.0;
            obj.sellFee = 0.0;
            obj.totalFee = 0.0;
            obj.netIncome = 0.0;
            obj.orderCnt = 0;

            dayNetIncome.forEach((sobj)=>{
                if(objUtil.cnvtYYYYMMDD2YYYYMM(sobj.orderDate) === monStr){
                    obj.profit    += Number(sobj.profit);
                    obj.buyFee    += Number(sobj.buyFee);
                    obj.sellFee   += Number(sobj.sellFee);
                    obj.totalFee  += Number(sobj.totalFee);
                    obj.netIncome += Number(sobj.netIncome);
                    obj.orderCnt  += Number(sobj.orderCnt);
                }
            });

            obj.profit    = obj.profit   .toFixed(fixedNumber);
            obj.buyFee    = obj.buyFee   .toFixed(fixedNumber);
            obj.sellFee   = obj.sellFee  .toFixed(fixedNumber);
            obj.totalFee  = obj.totalFee .toFixed(fixedNumber);
            obj.netIncome = obj.netIncome.toFixed(fixedNumber);
            obj.orderCnt  = obj.orderCnt;

            // 재계산
            obj.feeRate = objUtil.parseNoneNumValue(parseFloat(100*(obj.totalFee/obj.profit)).toFixed(fixedNumber));
            obj.prfRate = parseFloat(100*(obj.netIncome/obj.accVolumn)).toFixed(fixedNumber);
            obj.capMonPrfRate = parseFloat(100*(obj.netIncome/(Number(obj.cuIncomeSum) - Number(obj.netIncome) + Number(obj.accVolumn)))).toFixed(fixedNumber);

            // 값보정
            obj.feeRate = (obj.feeRate > 0.0 ? obj.feeRate : 0.0);
        });

        return monthNetIncome;
    };

    svcObj.cnvtYYYYMMDD2YYYYMM = function(yyyymmdd){

    };

    /**
     * 일 목록 가져오기
     * @param {any} starttime [필수] 시작시간
     * @param {any} endtime [선택] 종료시간
     */
    svcObj.getDateArr = function(starttime, endtime){
        let timeIndex = 0;
        let startTimestamp = starttime;
        let endTimestamp = (endtime ? endtime : Date.now()+bConst.DATE_MSEC.DAY);
        let dateArr = [];

        // 순차적으로 날짜값 생성 (YYYYMMDD)
        for(timeIndex=startTimestamp; timeIndex < endTimestamp; timeIndex += bConst.DATE_MSEC.DAY){
            dateArr.push(objUtil.getYYYYMMDD(timeIndex));
        }

        return dateArr;
    };

    /**
     * 월 목록 가져오기
     * @param {any} starttime [필수] 시작시간
     * @param {any} endtime [선택] 종료시간
     */
    svcObj.getDateMonthArr = function(starttime, endtime){
        const dateArr = svcObj.getDateArr(starttime, endtime);
        let dateMonthArr = [];

        dateArr.forEach((obj)=>{
            const _monthStr = String(obj).substr(0,6);
            if(dateMonthArr.indexOf(_monthStr) < 0){
                dateMonthArr.push(_monthStr);
            }
        });

        return dateMonthArr;
    };
    
    /**
     * 현물 - 거래내역의 일별 수익/수수료/순손익 반환(Json) 
     * 
     * return json구조
     * "orderDate",   : 날짜(YYYYMMDD)      
     * "profit",      : 수익금
     * "buyFee",      : 매수_수수료
     * "sellFee",     : 매도_수수료
     * "totalFee",    : 총_수수료
     * "netIncome",   : 수수료차감_순수익
     * "orderCnt",    : 거래횟수
     * "feeRate",     : 수익금대비_수수료비율
     * "prfRate",     : 원금대비_수익률
     * "accVolumn",   : 원금
     * "cuIncomeSum", : 총_순수익금
     * "weightProfit" : 원금대비_가중수익률
     * "pastDay"      : 투자기간
     * "dayComInRate" : 일평균복리수익률
     */
    svcObj.selectNetIncomeOfDaySpot = function(symbol, starttime, endtime, fixedNumber){
        logger.debug('getNetIncome call');

        let startUnixTime = Number(starttime);
        let endUnixTime = Number(endtime);
        const cnvtSymbol = objUtil.cnvtCoin2CoinUsdt(symbol);

        startUnixTime = (String(startUnixTime) == 'NaN' ? null : (Date.now() - (startUnixTime*1000*3600)));
        endUnixTime   = (String(endUnixTime) == 'NaN' ? null : (Date.now() - (endUnixTime*1000*3600)));

        logger.debug('getNetIncome start:'+startUnixTime+', end:'+endUnixTime);

        return (new Promise((resolve, reject)=>{
            if(!svcObj.checkInit()){
                reject(jsonObj.getMsgJson('-1','checkInit. false.'));
            }

            let rawData = null;
            let dwData = null;

            sqlObj.selectOldHistory(cnvtSymbol, startUnixTime, endUnixTime)
            .then((result)=>{
                rawData = result;

                // 이 데이터는 모든계좌의 잔액기록이 필요하므로, 날짜조건을 받지않음.
                return sqlObj.selectDwDetailHistory(); 

            }).then((result)=>{
                dwData = result;
                resolve(svcObj.selectNetIncomeOfDay(rawData, dwData, fixedNumber));
                
            }).catch((err)=>{
                reject(jsonObj.getMsgJson('-1',err));
            });
        }));
    };

    /**
     * 선물 - 거래내역의 일별 수익/수수료/순손익 반환(Json) 
     * 
     * return json구조
     * "orderDate",   : 날짜(YYYYMMDD)      
     * "profit",      : 수익금
     * "buyFee",      : 매수_수수료
     * "sellFee",     : 매도_수수료
     * "totalFee",    : 총_수수료
     * "netIncome",   : 수수료차감_순수익
     * "orderCnt",    : 거래횟수
     * "feeRate",     : 수익금대비_수수료비율
     * "prfRate",     : 원금대비_수익률
     * "accVolumn",   : 원금
     * "cuIncomeSum", : 총_순수익금
     * "weightProfit" : 원금대비_가중수익률
     * "pastDay"      : 투자기간
     * "dayComInRate" : 일평균복리수익률
     */
    svcObj.selectNetIncomeOfDayFutures = function(symbol, starttime, endtime, fixedNumber){
        logger.debug('getNetIncome call');

        let startUnixTime = Number(starttime);
        let endUnixTime = Number(endtime);
        const cnvtSymbol = objUtil.cnvtCoin2CoinUsdt(symbol);

        startUnixTime = (String(startUnixTime) == 'NaN' ? null : (Date.now() - (startUnixTime*1000*3600)));
        endUnixTime   = (String(endUnixTime) == 'NaN' ? null : (Date.now() - (endUnixTime*1000*3600)));

        logger.debug('getNetIncome start:'+startUnixTime+', end:'+endUnixTime);

        return (new Promise((resolve, reject)=>{
            if(!svcObj.checkInit()){
                reject(jsonObj.getMsgJson('-1','checkInit. false.'));
            }

            let rawData = null;
            let dwData = null;

            sqlFuObj.selectFuturesOldHistory(cnvtSymbol, startUnixTime, endUnixTime)
            .then((result)=>{
                rawData = result;

                // 이 데이터는 모든계좌의 잔액기록이 필요하므로, 날짜조건을 받지않음.
                return sqlObj.selectDwDetailHistory(); 

            }).then((result)=>{
                dwData = result;
                resolve(svcObj.selectNetIncomeOfDay(rawData, dwData, fixedNumber));
                
            }).catch((err)=>{
                reject(jsonObj.getMsgJson('-1',err));
            });
        }));
    };


    /**
     * 일단위 수익기록 생성
     * @param {any} rawData   일 단위 원본데이터(old_history)
     * @param {*} dwData      계좌정보(입금정보)
     * @param {*} fixedNumber 소숫점 처리
     * @returns 
     */
    svcObj.selectNetIncomeOfDay = function(rawData, dwData, fixedNumber){
        logger.debug('getNetIncome call');

        let dateAcc = {};
        let dateArr = [];
        let dateProfit = [];
        let startTimestamp = 0;

        // 데이터가 없을경우, 빈Arr 반환
        if(!(rawData && rawData.length > 0)){
            return resolve(dateProfit);
        }

        startTimestamp = rawData[0].sellTime;

        // 순차적으로 날짜값 생성 (YYYYMMDD)
        dateArr = svcObj.getDateArr(startTimestamp);
        
        // 각데이터에 일자값 삽입(YYYYMMDD)ß
        rawData.forEach((obj)=>{
            obj.orderDate = objUtil.getYYYYMMDD(obj.sellTime);
        });

        // 일자별 납입원금 계산
        dateArr.forEach((obj)=>{
            let dateVolumn = 0;

            dwData.forEach((dwObj)=>{
                const subDate = String(dwObj.dw_time).substring(0,8);
                
                if(obj >= subDate){
                    if(dwObj.dw_type === bConst.DW_TYPE.DEPO){
                        dateVolumn += parseFloat(dwObj.dw_volumn);
                    }else if(dwObj.dw_type === bConst.DW_TYPE.DEPO){
                        dateVolumn -= parseFloat(dwObj.dw_volumn);
                    }
                }
            });

            dateAcc[obj] = dateVolumn;
        });

        // 날짜별로 손익/수수료/순손익 계산
        dateArr.forEach((obj, idx)=>{
            const dateArrVolumn = dateAcc[obj];
            let json = {};
            json.orderDate = obj;

            json.profit = 0.0;
            json.buyFee = 0.0;
            json.sellFee = 0.0;
            json.totalFee = 0.0;
            json.netIncome = 0.0;
            json.orderCnt = 0;

            // 단위:($)
            rawData.forEach((obj)=>{
                if(obj.orderDate == json.orderDate){
                    json.profit += parseFloat(obj.profit);
                    json.buyFee += parseFloat(obj.buyFee);
                    json.sellFee += parseFloat(obj.sellFee);
                    json.totalFee += parseFloat(obj.buyFee) + parseFloat(obj.sellFee);
                    json.netIncome += parseFloat(obj.profit) - (parseFloat(obj.buyFee) + parseFloat(obj.sellFee));
                    json.orderCnt++;
                }
            });

            json.profit =    json.profit.toFixed(fixedNumber);
            json.buyFee =    json.buyFee.toFixed(fixedNumber);
            json.sellFee =   json.sellFee.toFixed(fixedNumber);
            json.totalFee =  json.totalFee.toFixed(fixedNumber);
            json.netIncome = json.netIncome.toFixed(fixedNumber);
            json.feeRate =    objUtil.parseNoneNumValue(parseFloat(100*(json.totalFee/json.profit)).toFixed(fixedNumber));
            json.prfRate =    parseFloat(100*(json.netIncome/dateArrVolumn)).toFixed(fixedNumber);

            // 값 보정
            json.feeRate = (json.feeRate > 0.0 ? json.feeRate : 0.0);
            
            // 납입원금
            json.accVolumn = dateArrVolumn; 

            // 누적수익합
            json.cuIncomeSum = (idx==0 ? parseFloat(json.netIncome) : (parseFloat(json.netIncome) + parseFloat(dateProfit[idx-1].cuIncomeSum)) ).toFixed(fixedNumber);

            dateProfit.push(json);
        });

        // 가중 수익률 계산
        (function(){
            let idx=0;
            let startDay = 0;
            let preWeightProfitRate = 0;
            let calcProfitRate = 0;

            for(idx=0; idx<dateProfit.length; idx++){
                // 첫 행은 가중수익률 없음.
                const obj = dateProfit[idx];
                if(idx===0){
                    obj.weightProfit = obj.prfRate;
                    startDay = obj.orderDate;
                    preWeightProfitRate = obj.prfRate;
                    continue;
                }

                // 가중 수익률 계산. (현재날짜까지의 단리 수익률임.)(이전기간수익률*현재기간수익률)
                calcProfitRate = (((1+preWeightProfitRate/100)*((parseFloat(obj.accVolumn)+parseFloat(obj.netIncome))/obj.accVolumn)-1)*100);
                
                obj.weightProfitRate = calcProfitRate.toFixed(fixedNumber);
                preWeightProfitRate = calcProfitRate;
                
                // 일 평균 복리수익률.
                const intervalDay = objUtil.getIntervalYYYYMMDD(startDay,obj.orderDate);
                obj.pastDay = intervalDay;
                obj.dayComInRate = ((Math.pow((1+(obj.weightProfitRate/100)), (1/intervalDay))-1)*100).toFixed(fixedNumber);
            }
        })();

        logger.debug('getNetIncome complete, '+objUtil.objView(dateProfit));
        return dateProfit;
    };

    /**
     * 비트코인 시세 조회
     * @param {any} dateType 날짜단위(D/M/Y)
     * @param {any} startTime 
     * @param {any} endTime 
     */
    svcObj.selectBitCoinPrice = function(dateType, startTime, endTime){
        startUnixTime = svcObj.getUnixTimeFromHour(startTime);
        endUnixTime   = svcObj.getUnixTimeFromHour(endTime);

        return sqlObj.selectBitCoinPriceStatics(dateType, startUnixTime, endUnixTime);
    };

    /**
     * 특정기간동안 총수익/수수료/순손익 계산
     * @param {any} startTime 시작시간
     * @param {any} endTime   종료시간
     */
    svcObj.selectTotalNetIncome = function(symbol,startTime, endTime){
        startUnixTime = svcObj.getUnixTimeFromHour(startTime);
        endUnixTime   = svcObj.getUnixTimeFromHour(endTime);

        let cnvtSymbol = objUtil.cnvtCoin2CoinUsdt(symbol);

        return sqlObj.selectTotalNetIncome(cnvtSymbol, startUnixTime, endUnixTime);
    }

    /**
     * 에러 통계 (보고기준)
     * @param {any} startTime 시작시간
     * @param {any} endTime 종료시간
     */
    svcObj.selectErrorInfo = function(startTime, endTime){
        startUnixTime = svcObj.getUnixTimeFromHour(startTime);
        endUnixTime   = svcObj.getUnixTimeFromHour(endTime);

        return (new Promise((resolve, reject)=>{
            sqlObj.selectErrorInfo(startUnixTime, endUnixTime).then((result)=>{
                let maxCnt = 0;
                let minCnt = 0;
                let avgCnt = 0;
                let totCnt = 0;
                let totYmd = 0;
                let resultJson = {};

                logger.debug('selectErrorInfo rawData:'+objUtil.objView(result));
                if(!(result && result.length > 0)){
                    return reject(jsonObj.getMsgJson('-1','selectErrorInfo result is empty.'));
                }



                result.forEach((obj, index)=>{
                    if(index < 1){
                        maxCnt = obj.cnt;                        
                        minCnt = obj.cnt;
                    }

                    if(obj.cnt > maxCnt){
                        maxCnt = obj.cnt;
                    }

                    if(obj.cnt < minCnt){
                        minCnt = obj.cnt;
                    }

                    totYmd++;
                    totCnt+= obj.cnt;
                });

                avgCnt = (totCnt/totYmd).toFixed(dealSet.viewFixed);

                resultJson.maxCnt = maxCnt;
                resultJson.minCnt = minCnt;
                resultJson.avgCnt = avgCnt;
                resultJson.totCnt = totCnt;
                resultJson.totYmd = totYmd;
                resultJson.ymdData = result;

                logger.debug('selectErrorInfo resultJson:'+objUtil.objView(resultJson));
                resolve(resultJson);
            }).catch((err)=>{
                reject(jsonObj.getMsgJson('-1',jsonObj.getMsgJson('-1',err)+', selectErrorInfo fail.'));
            });
        }));
    };

    ////////////////////////////////////////////////////////////////////////////////////////////////////
    // Common
    ////////////////////////////////////////////////////////////////////////////////////////////////////
    /**
     * 
     * @param {any} hour 시간(12 or 24...등등)을 현재시간 기준 유닉스타임으로 변환
     */
    svcObj.getUnixTimeFromHour = function(hour){
        let startUnixTime = Number(hour);
        startUnixTime = (String(startUnixTime) == 'NaN' ? null : (Date.now() - (startUnixTime*1000*3600)));

        return startUnixTime;
    }

    return svcObj;
})();