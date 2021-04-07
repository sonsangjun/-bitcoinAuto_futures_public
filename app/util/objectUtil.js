const logger = require("../conf/winston");
const bConst = require('./bitConst');

let objUtil = {};

/**
 * 객체 내용을 String로 변환한다.
 * (JSON Object Method 적용.)
 * @param {any} arr 객체
 */
objUtil.objView = function(arr){
    // 공백
    if(!arr){
        return '';
    }

    // 문자열, 숫자, 불값
    if(typeof arr === 'string' || typeof arr === 'number' || typeof arr === 'boolean' ){
        return arr;
    }

    // 배열 && Object
    try{
        let jsonStr = "";

        if(arr['stack']){
            jsonStr = arr['stack'].toString();
        }else{
            jsonStr = JSON.stringify(arr,null,1);
        }

        const keys = Object.keys(jsonStr);
        const len = (keys ? keys.length : 0);
        
        return (len > 0 ? jsonStr : arr.toString());

    }catch(e){
        return 'undefined error.';
    }
};


/**
 * 값을 Type에 맞게 변경
 * @param {any} value 본래값
 */
objUtil.parseValue = function(value){
    if(value==null || value==undefined){
        return value;
    }
    
    // Boolean체크
    const booVal = String(value).toUpperCase();

    if(booVal==='TRUE' || booVal==='FALSE'){
        return (booVal==='TRUE' ? true : false);
    }

    // Number or String 체크
    const numVal = Number(value);

    if(String(numVal) === 'NaN'){
        // String 간주
        return value;
    }

    return numVal;
};

/**
 * 숫자가 아닌 오류값을 숫자0으로 반환
 * @param {any} value 
 * @param {any} replaceValue 
 */
objUtil.parseNoneNumValue = function(value, replaceValue){
    if(!value){
        return (replaceValue ? replaceValue : 0);
    }

    const typeofStr = typeof value;

    if(value==='NaN' || value==='undefined' || value==='null'){
        return (replaceValue ? replaceValue : 0);
    }

    return value;
};

/**
 * dealSetting값을 json로 변환
 */
objUtil.dealSetting2Json = function(result){
    const dealSet = {};

    result.forEach((obj)=>{
        // '.'으로 스플릿하여 최대 5개구분자까지 처리
        const sKey = obj.setting_key;
        const sKeyArr = sKey.split('.');
        const sKeyLen = sKeyArr.length;
        const sVal = objUtil.parseValue(obj.setting_value);

        switch(sKeyLen){
            case 1 : 
                dealSet[sKey] = sVal; 
                break;

            case 2 : 
                if(!dealSet[sKeyArr[0]]){ dealSet[sKeyArr[0]] = {}; }

                dealSet[sKeyArr[0]][sKeyArr[1]] = sVal; 
                break;
            
            case 3 : 
                if(!dealSet[sKeyArr[0]]){ dealSet[sKeyArr[0]] = {}; }
                if(!dealSet[sKeyArr[0]][sKeyArr[1]]){ dealSet[sKeyArr[0]][sKeyArr[1]] = {}; }
                
                dealSet[sKeyArr[0]][sKeyArr[1]][sKeyArr[2]] = sVal;
                break;
            
            default : 
                break;
        }
    });

    return dealSet;
};

/**
 * json을 병합한다.
 * (하위JSON을 json2로 덮어쓰지 않고, 같이 병합한다.)
 * @param {any} json1 
 * @param {any} json2 
 */
objUtil.mergeJson = function(json1, json2){
    let newJson = JSON.parse(JSON.stringify(json1));
    const json1Key = Object.keys(json1);
    const json2Key = Object.keys(json2);

    json2Key.forEach((key)=>{
        const typeofJson1 = typeof json1[key];
        const typeofJson2 = typeof json2[key];

        if(typeofJson2 === 'undefined' || String(json2[key]) === 'null'){
            if(typeofJson1 === 'undefined' || String(json1[key]) === 'null'){
                newJson[key] = '';
            }else{
                newJson[key] = json1[key];
            }

        }else if(objUtil.checkJson(json1[key]) && objUtil.checkJson(json2[key])){
            newJson[key] = objUtil.mergeJson(json1[key],json2[key]);
        }else if(typeofJson2 === 'string' || typeofJson2 === 'number' || typeofJson2 === 'boolean'){
            newJson[key] = json2[key];
        }
    });
    
    return newJson;
};

/**
 * 계좌심볼을 거래심볼로 변경
 * (ex. BTC -> BTCUSDT)
 * @param {any} symbol 코인 심볼
 */
objUtil.cnvtCoin2CoinUsdt = function(symbol){
    const upperSymbol = (symbol ? String(symbol).toUpperCase() : '');
    switch(upperSymbol){
        case bConst.ACCOUT_SYMBOL.BTC : return bConst.TRADE_SYMBOL_USDT.BTC; 
        case bConst.ACCOUT_SYMBOL.BNB : return bConst.TRADE_SYMBOL_USDT.BNB; 
        default : return symbol;
    }
};

/**
 * 파라메터가 json인지 체크
 * @param {any} obj json
 */
objUtil.checkJson = function(obj){
    try{
        const jsonObj = JSON.parse(JSON.stringify(obj));
        return (typeof jsonObj === 'object');
    }catch(e){
        return false;
    }
}

objUtil.getYYYYMMDD = function(timestamp) {
    const dObj = new Date(timestamp);
    var mm = dObj.getMonth() + 1;
    var dd = dObj.getDate();
  
    return [dObj.getFullYear(),
            (mm>9 ? '' : '0') + mm,
            (dd>9 ? '' : '0') + dd
           ].join('');
};

objUtil.cnvtYYYYMMDD2YYYYMM = function(yyyymmdd){
    if(!yyyymmdd || yyyymmdd.length !== 8){
        return yyyymmdd;
    }

    return yyyymmdd.substr(0,6);
};

objUtil.getIntervalYYYYMMDD = function(start, end) {
    const startStamp = new Date(start.substr(0,4)+'-'+start.substr(4,2)+'-'+start.substr(6,2)).getTime();
    const endStamp = new Date(end.substr(0,4)+'-'+end.substr(4,2)+'-'+end.substr(6,2)).getTime();

    const intervalStamp = endStamp - startStamp;
    const intervalDay = Math.ceil((intervalStamp / (86400*1000)));

    return intervalDay;
};

objUtil.getHHMMSS = function(timestamp) {
    const dObj = new Date(timestamp);
    var hh = dObj.getHours();
    var mm = dObj.getMinutes();
    var ss = dObj.getSeconds();
  
    return [(hh>9 ? '' : '0') + hh,
            (mm>9 ? '' : '0') + mm,
            (ss>9 ? '' : '0') + ss,
           ].join('');
};

objUtil.getHHMM = function(timestamp){
    return objUtil.getHHMMSS(timestamp).substr(0,4);
}

/**
 * YYYYMMDDHHMMSS 꼴로 반환
 * @param {any} timestamp 유닉스타임
 */
objUtil.getFullTime = function(timestamp){
    return objUtil.getYYYYMMDD(timestamp) + objUtil.getHHMMSS(timestamp) ;
};

/**
 * 현재 개발계인지 운영계인지 값 반환
 */
objUtil.getMode = function(){
    return process.env.NODE_ENV !== 'production' ? 'development' : 'production';
}

/**
 * 개발계인지 체크
 */
objUtil.checkDevMode = function(){
    return (objUtil.getMode() !== 'production');
}

module.exports = objUtil;