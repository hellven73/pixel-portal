import EpoxyTransport from '/epoxy/index.mjs';
import {isAdRequest,blockedAdResponse} from '/ad-filter.mjs';

// Bare-Mux 2 uses header records; Epoxy 3 uses repeated header entries.
const entries = headers => Array.isArray(headers) ? headers : Object.entries(headers || {}).flatMap(([key,value]) => (Array.isArray(value) ? value : [value]).map(v => [key,String(v)]));
export default class PixelEpoxyTransport extends EpoxyTransport {
  constructor(options){super(options);this.adblock=options?.adblock!==false;}
  async request(url,method,body,headers,signal) {
    if(this.adblock&&isAdRequest(url))return blockedAdResponse();
    const response=await super.request(url,method,body,entries(headers),signal);
    const record={};
    for(const [key,value] of response.headers) (record[key]??=[]).push(value);
    return {...response,headers:record};
  }
  connect(url,protocols,headers,...callbacks) {
    return super.connect(url,protocols,entries(headers),...callbacks);
  }
}
