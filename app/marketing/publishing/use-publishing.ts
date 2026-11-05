"use client";
import {useCallback,useEffect,useRef,useState} from 'react';

import {CreativeCancelled,assertCreativeCurrent,guardCreativeResponse,invalidatesCreativeAccess} from '../creative/request-state';
import {getSupabaseClient} from '@/lib/supabaseClient';
import type {PublishingCommand,PublishingWorkspace} from '@/lib/marketing/publishing-types';
export function usePublishing(){
 const [data,setData]=useState<PublishingWorkspace|null>(null),[error,setError]=useState(''),[accessInvalidated,setAccessInvalidated]=useState(false);
 const generation=useRef(0),sequence=useRef(0),identity=useRef<string|null>(null),mounted=useRef(true);
 const invalidate=useCallback(()=>{generation.current++;setAccessInvalidated(true);setData(null);setError('Phiên hoặc quyền truy cập đã thay đổi. Mở lại thư viện.');},[]);
 const request=useCallback(async(path='/api/marketing/publishing',init:RequestInit={})=>{const g=generation.current;const current=()=>g===generation.current&&mounted.current;const {data:auth}=await getSupabaseClient().auth.getSession();assertCreativeCurrent(current);if(!auth.session||identity.current&&identity.current!==auth.session.user.id){invalidate();throw Error('Vui lòng đăng nhập lại.');}identity.current=auth.session.user.id;const response=await fetch(path,{...init,cache:'no-store',headers:{...init.headers,Authorization:`Bearer ${auth.session.access_token}`}});assertCreativeCurrent(current);if(!response.ok){const body=await response.json();assertCreativeCurrent(current);if(invalidatesCreativeAccess(response.status,body.code))invalidate();throw Error(body.error||'Không thể thực hiện.');}return guardCreativeResponse(response,current);},[invalidate]);
 const refresh=useCallback(async()=>{const g=generation.current;const n=++sequence.current;const body=await (await request()).json();if(g===generation.current&&n===sequence.current&&mounted.current){setData(body);setAccessInvalidated(false);setError('');}},[request]);
 const command=useCallback(async<T,>(value:PublishingCommand):Promise<T>=>{const g=generation.current;const body=await(await request(undefined,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)})).json();assertCreativeCurrent(()=>g===generation.current&&mounted.current);await refresh().catch(e=>{if(!(e instanceof CreativeCancelled)&&g===generation.current&&mounted.current)setError('Đã lưu; chưa tải lại được dữ liệu.');});assertCreativeCurrent(()=>g===generation.current&&mounted.current);return body.result as T;},[request,refresh]);
 // This effect starts the authenticated external read; generation is an identity counter.
 // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
 useEffect(()=>{mounted.current=true;const g=generation.current;void refresh().catch(e=>{if(!(e instanceof CreativeCancelled)&&g===generation.current&&mounted.current)setError(e.message);});const {data:a}=getSupabaseClient().auth.onAuthStateChange((event,s)=>{if(event==='SIGNED_OUT'||s&&identity.current&&s.user.id!==identity.current)invalidate();});return()=>{mounted.current=false;generation.current++;a.subscription.unsubscribe();};},[refresh,invalidate]);
 return {data,error,accessInvalidated,request,refresh,command};
}
