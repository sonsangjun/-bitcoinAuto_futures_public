const nodemailer = require('nodemailer');
const logger = require('../conf/winston');
const sql = require('./sqlUtil');
const objUtil = require('./objectUtil');
const bConst = require('../util/bitConst');

let transporter = {};

transporter.getTransporter = function(){
    let dealSet = {};
    
    return sql.selectDealSetting(bConst.SYMBOL_COMM).then((result)=>{
        // DealSet 설정
        // dealSet
        console.warn('create transport selectDealSetting');

        if(!(result && result.length > 0)){
            return new Promise((resolve,reject)=>reject('getTransporter fail ==> selectDealSetting is empty'));
        }

        dealSet = objUtil.dealSetting2Json(result);
        console.log('getTransporter set dealSetting',dealSet);

        const mailSvc = {};
        
        // 알림 종류
        mailSvc.noticeType = {
            NOTICE : '[Notice]',
            EMCR_NOTICE : '[Emcy]',
            REGULAR : '[Regular]'
        };

        const obj = nodemailer.createTransport({
                service: dealSet.mail.service,
                host : 'smtp.gmail.com',
                port : 465,
                secure : true,
                auth: {
                    type: dealSet.mail.type,
                    user: dealSet.mail.user,
                    clientId: dealSet.mail.clientId,
                    clientSecret: dealSet.mail.clientSecret,
                    refreshToken: dealSet.mail.refreshToken,
                    accessToken: dealSet.mail.accessToken,
                    expires: parseInt(dealSet.mail.expires)
                }
            });
        
        // Default Option
        mailSvc.defaultOpt = {};
        mailSvc.defaultOpt.from = {}; // Sender (보내는 사람)
        mailSvc.defaultOpt.to = {};   // receivers (받는 사람)
        mailSvc.defaultOpt.from.name = '이름';
        mailSvc.defaultOpt.from.address = 'TEST@gmail.com';
        mailSvc.defaultOpt.to.address = '{yourAccout}@naver.com';
        mailSvc.defaultOpt.subject= "DefaultMain", // Subject line
        mailSvc.defaultOpt.html= "No Content." // html body

        // Default Mailing
        mailSvc.defaultSend = function(){
            logger.debug('defaultSend call');

            return (new Promise((resolve, reject)=>{
                obj.sendMail(mailSvc.defaultOpt, (error, info) => {
                    logger.debug('sendMail callback');    
                    console.log(error,info);
                    (error ? reject(error) : resolve(info));
                });
            }));
        };

        /**
         * 고정 수신자 메일 송신
         * (잔고 오링, 체결내역등등)
         */
        mailSvc.staticSendMail = function(subject, content, timestamp){
            logger.debug('mailSvc.staticSendMail call');

            const opt = {};
            opt.from = {}; // Sender (보내는 사람)
            opt.to = {};   // receivers (받는 사람)
            opt.from.name = dealSet.mail.sender;
            opt.from.address = dealSet.mail.senderAddr;
            opt.to.address = dealSet.mail.staticRecevierAddr;
            opt.subject= subject; // Subject line
            opt.html= content; // html body

            return (new Promise((resolve, reject)=>{
                logger.debug('mailSvc.staticSendMail.sendMail call');
                obj.sendMail(opt,(error,info)=>{
                    logger.debug('error : '+objUtil.objView(error));
                    logger.debug('info : '+objUtil.objView(info));
    
                    if(!error){
                        const json = {};
                        json.email_subject = subject;
                        json.email_content = content;
                        json.sendTime = timestamp;

                        sql.insertEmailSendHistory([json]);
                    }
                    (error ? reject(error) : resolve(info));
                });
            }));
        }

        console.log('getTransporter complete ==> ');
        return new Promise((resolve, reject)=>resolve(mailSvc));
    
    }).catch(function(err){
        const msg = (err ? err : 'mailling fail');

        console.error(err);
        logger.error(msg);
        return new Promise((resolve,reject)=>reject(msg));
    });
}

module.exports = transporter;