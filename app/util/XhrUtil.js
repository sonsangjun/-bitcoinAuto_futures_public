const XMLHttpRequest = require('xhr2');
const logger = require('../conf/winston');
const jsonUtil = require('../util/jsonUtil');
const objUtil = require('../util/objectUtil');

let xhrCall = {};

(function(){
    const jsonObj = jsonUtil.getJsonObj('xhrUtil');

    const timeoutValue = 5000; // Timeout 체크 대기시간
    const timeoutCode = '-1';
    const timeoutJson = 'BinanceServer Timeout(From autobit-fu)';

    let dealSet = {};

    const xhrObj = {
        /**
         * XHR Get호출
         * @param {*} url 대상 서버도메인(Url)
         * @param {*} param RequestBody객체
         * @param {json} header RequestHeader key:value형태의 json
         */
        xhrGet : function(url,param, header){
            const ajaxObj = new Promise((resolve,reject)=>{
                const xhr = new XMLHttpRequest();
                xhr.onload = function(){
                    var status = xhr.status;
                    if(status===200 || status===201){
                        logger.debug('xhrGet success status:'+status);
                        resolve(JSON.parse(xhr.responseText));
                    }else{
                        try{
                            logger.error('xhrGet fail status:'+status);
                            reject(JSON.parse(xhr.responseText));
                        }catch(e){
                            logger.error('xhrGet fail catch. xhr:');
                            reject(objUtil.objView(xhr));
                        }
                    }
                }

                // Xhr 타임아웃 처리
                xhr.ontimeout = function (e) {
                    reject(jsonObj.getMsgJson(timeoutCode, timeoutJson+'('+url+')('+param+')'));
                };

                xhr.open('GET', url+'?'+param);

                if(header){
                    const keys = Object.keys(header);
                    keys.forEach((key)=>{
                        xhr.setRequestHeader(key,header[key]);
                    });
                }

                // xhr.setRequestHeader('X-MBX-APIKEY',dealSet.APIKey);
                xhr.timeout = timeoutValue; // time in msec.
                xhr.send();
            });

            return ajaxObj;
        },

        /**
         * XHR POST 호출 (formData만)
         * SecretKey가 필요한 경우가 대부분 이므로,
         * Header에 API Key 탑재
         * @param {*} url 대상 서버도메인(Url)
         * @param {*} param RequestBody객체
         * @param {json} header RequestHeader key:value형태의 json
         */
        xhrPost : function(url,param, header){
            const ajaxObj = new Promise((resolve,reject)=>{
                const xhr = new XMLHttpRequest();
                xhr.onload = function(){
                    var status = xhr.status;
                    if(status===200 || status===201){
                        resolve(JSON.parse(xhr.responseText));
                    }else{
                        try{
                            reject(JSON.parse(xhr.responseText));
                        }catch(e){
                            logger.debug(xhr.responseText);
                        }
                    }
                }

                // Xhr 타임아웃 처리
                xhr.ontimeout = function (e) {
                    reject(jsonObj.getMsgJson(timeoutCode, timeoutJson+'('+url+')('+param+')'));
                };

                xhr.open('POST', url);

                if(header){
                    const keys = Object.keys(header);
                    keys.forEach((key)=>{
                        xhr.setRequestHeader(key,header[key]);
                    });
                }

                xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
                xhr.timeout = timeoutValue; // time in msec.
                xhr.send(param);
            });

            return ajaxObj;
        },
    };
    
    xhrCall = xhrObj;
})();

module.exports = xhrCall;