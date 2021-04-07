const objUtil = require('../util/objectUtil');
const logger = require('../conf/winston');
const sqlObj = require('../util/sqlUtil');
const jsonUtil = require('../util/jsonUtil');
const bConst = require('../util/bitConst');

const dotenv = require('dotenv');

dotenv.config();

module.exports = (function(){
    let dSetObj = {};
    let jsonObj = jsonUtil.getJsonObj('dealSetService');

    ////////////////////////////////////////////////////////////////////////////////////////////////////
    // 기본 값 정의  
    let dealSet = {
        // API정보
        // API baseUrl : 호출 기본경로
        // API PrivateKey : SecretKey이므로 노출시 재발급 받아야함.
        // API Key(RequestHeader에 설정)
        baseUrl : 'https://fapi.binance.com',
        APIPkey : '',
        APIKey : '',
        
        // 소숫점 자리(실제 비트코인 거래Method는 적용하면 안됨)
        // floatFixed 내부처리시
        // viewFixed  보고용
        floatFixed : 5,
        viewFixed  : 2,
    
        // 거래타입
        tradeType : {
            BUY : 'B',
            SELL : 'S'
        },
    
        // 매도 타입(일반/청산)
        sellType : {
            GENERAL : 'general',
            CLEARING : 'clearing'
        },
        
        // 쿨타임 타입(일반/청산)
        // coolTimeInterval : 대기시간(sec)
        coolTimetype : {
            GENERAL  : 300,
            CLEARING : 600
        },
    
        // 매수매도 조건 가격차이
        // buyCond : 매수조건, sellCond : 매도조건, rateGap : 유효간극(0.1==> 10%차이시 도달이라 가정)
        // hitWeight 가중치.(최고가 갱신시 카운트 가중치를 둠.)
        buyCond : -0.3,
        sellCond : 0.3,
        rateGap : 0.1,
        hitWeight : 2,
        isUseGap : false,

        buyGapOutCnt  : 3, // (매수)갭이탈횟수
        sellGapOutCnt : 3, // (매도)갭이탈횟수

        maxHitCond : {
            SELL : 10,
            BUY : 10
        },
        
        // Bit코인최대단위(소숫점단위)
        bitFixed : 8,
    
        // 매매수수료율(0.1,단위 %)
        // BNB코인결제시, 0.05%
        sbFee : 0.05,
    
        // 검사시간(sec)
        intervalTime : 3,
    
        // maxTradesLength (가져올 호가단위)
        maxTradesLength : 5,

        // initAccUsdt : 초기자본
        // sbCash : 고정매매금액
        initAccUsdt : 24000,
        sbCash : 2400,

        // recvWindow(mSec, HMAC SHA256 생성시 사용)
        recvWindow : 5000,

        // 거래심볼
        symbol : 'BTCUSDT',

        // 메일사용
        mail : {
            isUse : false,
            reportTime : '1800'
        },

        exchangeInfo : null,

        // 켈리공식을 이용한 베팅규모 동적조절여부
        // isOrderKellyRate 는 동적주문비율 사용여부
        // minSbCash은 거래소 최소거래단위인 10이 최소값.
        // modKellyRate는 켈리비율 보정수치(%)
        // staticKellyRate는 정적캘리비율 수치(미사용시 0)
        isUseKellyBetSbCash : false,
        isOrderKellyRate : true,
        minSbCash : 12,
        modKellyValue : 50,
        staticKellyRate  : 0,

        // 시세조회대상심볼
        coinPrice : {
            List : 'BTCUSDT, BNBUSDT',
            intervalTime : 1,
            weight : 49,
        },

        // 나노매수 기능
        nanoBuy : {
            isUseNanoBuy : true,
            nanoBuyRatio : 5
        },

        // 동적매도 기능
        dynamicSell : {
            isUse : true,
            minHitCnt : 150,
            intervalCnt : 300,
            coolTimeOfHour : 72
        },

        // 바이낸스 시스템 점검시간 (타임스탬프 값)
        systemCheck : {
            startTime : 0,
            endTime : 0
        },

        // (Dev용) 기준일자 설정
        stdDate : {
            isUseStdDate : false,
            stdDate : 1613692800000
        },

        // slack정보세팅
        slack : {
            token : '',
            botname : '',
            channel : '',
            intervalTime : 10,
        },

        ////////////////////////////////////////
        // Futures 속성
        F_APIPkey : '',      // Real-ApiPK
        F_APIKey  : '',      // Real-ApiK
        F_baseUrl : '',      // Real-baseUrl
        
        F_TestBaseUrl : '',  // Test-ApiPK
        F_TestAPIPkey : '',  // Test-ApiK
        F_TestAPIKey  : '',  // Test-baseUrl

        F_MarginType : '',   // Comm-마진타입
        F_Leverage : '',     // Comm-레버리지(Int)

        F_PositionRate : '',   // 현물매매금액 대비 Short포지션크기
        F_ClearMarginRate : '' // 최대허용 마진위험
    };

    /**
     * 기본 설정 값 가져오기
     */
    dSetObj.getDefaultSet = function(){
        return dealSet;
    };

    /**
     * 디비로부터 정보 가져오기
     */
    dSetObj.selectDealSetFromDBnEnv = function(){
        logger.debug('setDealSetting start ==> ');

        return (new Promise(async (resolve,reject)=>{
            try{
                const targetSymbol = process.env.targetSymbol;
                const commResult = await sqlObj.selectDealSetting(bConst.SYMBOL_COMM);
                const targetResult = await sqlObj.selectDealSetting(targetSymbol);

                let commJson = {};
                let targetJson = {};
                let finalJson = {};

                // DealSet 설정 From DB
                commJson = objUtil.dealSetting2Json(commResult);
                targetJson = objUtil.dealSetting2Json(targetResult);
                finalJson = objUtil.mergeJson(commJson, targetJson);
    
                // DealSet 설정 From Env (거래심볼)
                if(targetSymbol){
                    logger.debug('targetSymbol is '+targetSymbol);
                    finalJson.symbol = targetSymbol;
                }
                
                logger.debug('selectDealSetFromDBnEnv targetSymbol(.env):'+targetSymbol);
                logger.debug('selectDealSetFromDBnEnv complete ==> '+objUtil.objView(finalJson));
                resolve(finalJson);

            }catch(err){
                reject(jsonObj.getMsgJson('-1',err));
            }
        }));
    };

    return dSetObj;
})();