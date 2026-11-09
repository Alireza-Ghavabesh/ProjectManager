declare module 'ghasedaksms' {
  class Ghasedak {
    constructor(apiKey: string);
    sendSimpleSms(command: {
      sendDate?: string;
      message: string;
      receptor: string;
      linenumber?: string;
      clientReferenceId?: string;
      udh?: boolean;
    }): Promise<any>;
    sendBulkSms(command: {
      message: string;
      receptors: string[];
      linenumber?: string;
      sendDate?: string;
      clientReferenceId?: string;
    }): Promise<any>;
    sendOtpSms(command: {
      sendDate?: string;
      receptors: Array<{ mobile: string; clientReferenceId?: string }>;
      templateName: string;
      inputs: Array<{ param: string; value: string }>;
      udh?: boolean;
    }): Promise<any>;
  }
  export default Ghasedak;
  export = Ghasedak;
}
