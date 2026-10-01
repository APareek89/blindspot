import { AuthBoundaryError } from './security';
import { ApiError } from './api';
export function actionFailure(error:unknown):{ok:false;code?:string;error:string}{
 if(error instanceof AuthBoundaryError)return {ok:false,code:error.code,error:error.message};
 if(error instanceof ApiError && error.status===401)return {ok:false,code:'AUTH_REQUIRED',error:'Sign in to continue.'};
 return {ok:false,error:error instanceof ApiError?error.message.slice(0,300):'The action could not be completed. Refresh and try again.'};
}
