/**
 * 표준 반환형태
 */
const objUtil = require("./objectUtil");
let jsonObj = {};

/**
 * JsonMsg 초기화
 * 초기화 하지 않으면 사용할 수 없다.
 * @param {any} name jsonMsg를 만드는 JS명칭
 */
jsonObj.getJsonObj = function(name){
    return (function(name){
        let repreName = name;
        let _jsonObj = {}
        /**
         * 
         * @param {any} code 코드값(0정상, -1비정상)
         * @param {any} msg  처리메시지
         */
        _jsonObj.getMsgJson = function(code, msg){ 
            let defaultJson = {'code':code, 'msg':msg};
    
            const cnvtMsg2Json = _jsonObj.getMsgJsonFromBinance(msg);
    
            if(!cnvtMsg2Json){            
                defaultJson.msg = ('['+repreName+'] '+objUtil.objView(msg));
            }
    
            return (cnvtMsg2Json ? cnvtMsg2Json : defaultJson);
        }
        
        /**
         * 
         * @param {any} msg msg가 바이낸스에서 온건지 체크
         */
        _jsonObj.getMsgJsonFromBinance = function(msg){
            if(msg && msg.code && msg.msg){
                return {code : msg.code , msg : (objUtil.objView('['+repreName+'] '+msg.msg))};
            }else{
                return null;
            }
        }
    
        return _jsonObj;
    })(name);
};

module.exports = jsonObj;

 