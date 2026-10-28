import { appConfig, assertSafeRemoteUrl } from '../config';
import { resolveOnchainPolicy } from './policy';
import { strictFetch, readBoundedText } from '../strict-http-transport';
export function onchainProvider() {
  const policy=resolveOnchainPolicy({
    network:process.env.EXPO_PUBLIC_BITCOIN_NETWORK||(appConfig.isMainnet?'mainnet':'regtest'),
    esploraUrl:process.env.EXPO_PUBLIC_BITCOIN_ESPLORA_URL,
    mainnetEnabled:process.env.EXPO_PUBLIC_ENABLE_BITCOIN_MAINNET==='true',allowLocal:appConfig.allowInsecureHttp,
  });
  assertSafeRemoteUrl(policy.esploraUrl,'Bitcoin provider');return policy;
}
export async function onchainRequest(path:string,init?:RequestInit,limit=100_000):Promise<string>{
  if(!path.startsWith('/')||path.startsWith('//'))throw new Error('Invalid Bitcoin provider request.');
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20_000);
  try{
    const response=await strictFetch(onchainProvider().esploraUrl+path,{...init,signal:controller.signal},limit,true);
    if(!response.ok||response.redirected)throw new Error('Bitcoin provider is unavailable.');
    return await readBoundedText(response,'Bitcoin provider',limit,controller,limit);
  }finally{clearTimeout(timer);controller.abort();}
}
