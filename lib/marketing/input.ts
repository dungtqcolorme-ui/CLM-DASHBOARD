import {MarketingError} from "@/lib/marketing/domain";
export {creativeId as inputId} from "@/lib/marketing/creative-domain";
export function invalidInput():never{throw new MarketingError("Dữ liệu hoặc trường nhập không hợp lệ.",400,"invalid_input");}
export function inputObject(v:unknown):Record<string,unknown>{if(!v||typeof v!=="object"||Array.isArray(v))invalidInput();return v as Record<string,unknown>;}
export function inputKeys(v:Record<string,unknown>,keys:string[]){if(Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))invalidInput();}
export function inputText(v:unknown,max:number,required=false,trim=true):string{if(typeof v!=="string"||v.length>max||v.includes("\0")||(required&&!v.trim()))invalidInput();return trim?v.trim():v;}
export function inputNumber(v:unknown,min:number,max:number,integer=false):number{if(typeof v!=="number"||!Number.isFinite(v)||v<min||v>max||(integer&&!Number.isInteger(v)))invalidInput();return v;}
export const inputVersion=(v:unknown)=>inputNumber(v,1,2147483647,true);
export function inputChoice<T extends string>(v:unknown,choices:readonly T[]):T{if(typeof v!=="string"||!choices.includes(v as T))invalidInput();return v as T;}
export function inputBoolean(v:unknown):boolean{if(typeof v!=="boolean")invalidInput();return v;}
export function inputDate(v:unknown):string{if(typeof v!=="string"||!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(v))invalidInput();const d=new Date(v+"T00:00:00Z");if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==v)invalidInput();return v;}
export function inputTimestamp(v:unknown):string|null{if(v===null)return null;if(typeof v!=="string"||!/^[1-9]\d{3}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(v))invalidInput();inputDate(v.slice(0,10));if(Number(v.slice(11,13))>23||Number(v.slice(14,16))>59||Number(v.slice(17,19)||0)>59||!Number.isFinite(Date.parse(v)))invalidInput();const iso=new Date(v).toISOString();if(!/^[1-9]\d{3}-/.test(iso))invalidInput();return iso;}
export function inputColor(v:unknown):string{if(typeof v!=="string"||!/^#[0-9a-f]{6}$/i.test(v))invalidInput();return v;}
