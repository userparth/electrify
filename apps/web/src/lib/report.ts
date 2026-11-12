const URL = process.env.NEXT_PUBLIC_REPORT_URL ?? '';

/** Sends uncaught errors to the server log (React 19 reports render crashes there too); only the hosted build has one. */
export const REPORT_SCRIPT = URL ? `(function(){var n=0,seen={};function s(m,w){m=String(m).slice(0,1500);if(n>=5||seen[m])return;n++;seen[m]=1;try{fetch(${JSON.stringify(URL)},{method:'POST',credentials:'same-origin',keepalive:true,headers:{'content-type':'application/json','x-eb':'1'},body:JSON.stringify({msg:m,where:(location.pathname+' '+(w||'')).slice(0,300)})}).catch(function(){})}catch(e){}}
addEventListener('error',function(e){if(e.message)s(e.message,(e.filename||'').split('/').pop()+':'+e.lineno+':'+e.colno+' '+(e.error&&e.error.stack||'').slice(0,600))});
addEventListener('unhandledrejection',function(e){var r=e.reason;s('Unhandled: '+(r&&r.message||r),(r&&r.stack||'').slice(0,600))})})();` : '';
