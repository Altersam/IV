/* Host integration: see research/remote-control.md. */
(() => {
  'use strict';
  const base = new URL('.', document.currentScript.src);
  let dependencies;
  function load(path) { return new Promise((resolve,reject) => { const s=document.createElement('script'); s.src=new URL(path,base); s.onload=resolve; s.onerror=reject; document.head.append(s); }); }
  function ready() { return dependencies ||= load('common.js').then(()=>Promise.all([load('vendor/peerjs-1.5.5.min.js'),load('vendor/qrcode-1.4.4.js')])); }
  function mount(adapter) {
    for (const key of ['getState','navigate','subscribe','setRemoteMode']) if(typeof adapter[key]!=='function') throw new TypeError('IvRemoteHost: '+key);
    const root=document.createElement('iv-remote-host'); document.body.append(root);
    const dom=root.attachShadow({mode:'open'});
    dom.innerHTML=`<style>
      :host{position:fixed;inset:auto auto max(8px,env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-left));z-index:2147483646;font:16px Golos,Arial,sans-serif;color:#10364c}*{box-sizing:border-box}button{font:inherit;cursor:pointer;border:0;border-radius:14px;background:#d4f5f6;color:#10364c;min-height:44px;padding:10px 18px}button:focus-visible,a:focus-visible{outline:3px solid #007ea4;outline-offset:3px}.tiny{width:36px;min-height:36px;padding:4px;border:1px solid #53b9c9;background:#effbfc;box-shadow:0 2px 10px #063b4c22;font-size:21px;border-radius:50%}dialog{border:0;border-radius:24px;padding:28px;max-width:min(92vw,460px);max-height:90dvh;overflow:auto;color:inherit;box-shadow:0 16px 80px #002c5055;background:#f5fcff}dialog::backdrop{background:#092e4c99}h2{font:800 25px Manrope,Arial;margin:0 0 12px}p{line-height:1.55;margin:12px 0}#qr{background:white;padding:14px;border-radius:16px;max-width:290px;margin:16px auto}#qr svg{display:block;width:100%;height:auto}.actions{display:flex;gap:10px;flex-wrap:wrap}#end{background:#103e58;color:white}#status{min-height:48px}a{color:#006f91} [hidden]{display:none!important}
    </style><button class="tiny" aria-label="Пульт с планшета" title="Пульт с планшета">⌁</button><dialog aria-labelledby="heading"><h2 id="heading">Пульт с планшета</h2><p>Откройте камеру планшета и наведите на QR. Заметки и стрелки появятся на планшете после подключения.</p><p id="status" role="status">Подготовка подключения…</p><div id="qr" hidden></div><p><a id="link" hidden target="_blank" rel="noopener noreferrer">Открыть пульт на этом устройстве</a></p><div class="actions"><button id="close">Закрыть окно</button><button id="end">Завершить сеанс</button></div></dialog>`;
    const $=s=>dom.querySelector(s), dialog=$('dialog'), status=$('#status');
    let peer,session,active,owner,lastSeq=0,lastSeen=0,generation=0,destroyed=false,connected=false,opening=false;
    const pending=new Set();
    const mode=value=>{ if(connected!==value){connected=value;adapter.setRemoteMode(value);} $('.tiny').title=value?'Пульт подключён — управление сеансом':'Пульт с планшета'; };
    const state=()=>{const s=adapter.getState();return {index:Math.max(0,Math.trunc(s.index)||0),total:Math.max(1,Math.trunc(s.total)||1),title:String(s.title||'').slice(0,500),notes:String(s.notes||'').slice(0,100000),previewUrl:IvRemote.preview(s.previewUrl)};};
    const publish=()=>{if(active&&connected) IvRemote.send(active,{type:'state',state:state(),ack:lastSeq});};
    const lost=conn=>{pending.delete(conn);if(active===conn){active=null;mode(false);status.textContent='Связь прервалась. Локальные стрелки доступны; планшет попробует подключиться снова.';}};
    function disconnect(){generation++;opening=false;session=null;owner=null;lastSeq=0;mode(false);for(const c of pending)c.close();pending.clear();if(active){IvRemote.send(active,{type:'ended'});active.close();active=null;}if(peer){peer.destroy();peer=null;}$('#qr').hidden=true;$('#qr').replaceChildren();$('#link').hidden=true;$('#link').removeAttribute('href');status.textContent='Сеанс завершён. Для нового подключения закройте окно и снова нажмите кнопку пульта.';}
    function accept(conn){
      if(pending.size>=4){conn.close();return;}pending.add(conn);
      const authTimer=setTimeout(()=>{if(active!==conn)conn.close();},6000);
      conn.on('close',()=>{clearTimeout(authTimer);lost(conn);});conn.on('error',()=>lost(conn));
      conn.on('data',msg=>{
        if(!msg||typeof msg!=='object')return;
        if(active!==conn){
          if(msg.type!=='auth'||msg.v!==1||!session||msg.token!==session.token||!/^\w{64}$/.test(msg.client||'')){IvRemote.send(conn,{type:'rejected',reason:'invalid'});setTimeout(()=>conn.close(),100);return;}
          if((owner&&owner!==msg.client)||(active&&active!==conn)){IvRemote.send(conn,{type:'rejected',reason:'busy'});setTimeout(()=>conn.close(),100);return;}
          clearTimeout(authTimer);pending.delete(conn);owner=msg.client;active=conn;lastSeen=Date.now();mode(true);status.textContent='Пульт подключён. Панель скрыта. Чтобы вернуть её, завершите сеанс этой кнопкой.';IvRemote.send(conn,{type:'ready',ack:lastSeq});publish();dialog.close();$('.tiny').focus();return;
        }
        lastSeen=Date.now();
        if(msg.type==='ping'){IvRemote.send(conn,{type:'pong'});return;}
        if(msg.type==='leave'){disconnect();return;}
        if(msg.type==='sync'){publish();return;}
        if(msg.type==='command'&&Number.isSafeInteger(msg.seq)&&msg.seq>0){
          if(msg.seq===lastSeq+1&&(msg.direction==='prev'||msg.direction==='next')){lastSeq=msg.seq;adapter.navigate(msg.direction);}
          publish();
        }
      });
    }
    async function openPairing(){
      if(destroyed)return;if(!dialog.open)dialog.showModal();if(session||opening)return;
      opening=true;const gen=++generation;status.textContent='Подготовка подключения…';
      try{await ready();if(gen!==generation||destroyed)return;
        session={id:'iv-'+IvRemote.random(),token:IvRemote.random()};
        peer=new Peer(session.id,IvRemote.options(adapter.peerOptions));
        const timer=setTimeout(()=>{if(gen===generation&&!$('#link').href)status.textContent='Сервис подключения не отвечает. Проверьте интернет. Локальные стрелки работают; завершите сеанс и попробуйте снова.';},15000);
        peer.on('open',()=>{clearTimeout(timer);if(gen!==generation)return;const url=new URL(adapter.remoteUrl||'../../remote.html',base);url.hash=new URLSearchParams({host:session.id,token:session.token}).toString();const qr=qrcode(0,'M');qr.addData(url.href);qr.make();$('#qr').innerHTML=qr.createSvgTag({cellSize:4,margin:4,scalable:true});$('#qr').hidden=false;$('#link').href=url.href;$('#link').hidden=false;status.textContent='Готово к подключению. QR действует до завершения этого сеанса.';});
        peer.on('connection',accept);peer.on('error',()=>{if(gen!==generation)return;status.textContent='Не удалось подключиться. Проверьте интернет или используйте другую сеть. В некоторых сетях нужен отдельный сервер ретрансляции; локальные стрелки работают.';if(!active)mode(false);});
        peer.on('disconnected',()=>{if(gen===generation&&!peer.destroyed){try{peer.reconnect();}catch(_){}}});
      }catch(_){status.textContent='Не удалось загрузить пульт. Локальные стрелки работают. Попробуйте обновить страницу.';}finally{opening=false;}
    }
    const tick=setInterval(()=>{if(active&&Date.now()-lastSeen>10000){const c=active;lost(c);c.close();}},2000);
    const unsubscribe=adapter.subscribe(publish);
    const onOffline=()=>{if(active){const c=active;lost(c);c.close();}};
    window.addEventListener('offline',onOffline);
    $('.tiny').onclick=openPairing;$('#close').onclick=()=>dialog.close();$('#end').onclick=()=>{disconnect();dialog.close();$('.tiny').focus();};
    dialog.addEventListener('keydown',event=>event.stopPropagation());
    // Native dialog handles Escape only while it is open; never intercept deck keys.
    return {openPairing,disconnect,destroy(){if(destroyed)return;destroyed=true;disconnect();clearInterval(tick);unsubscribe?.();window.removeEventListener('offline',onOffline);root.remove();}};
  }
  window.IvRemoteHost=Object.freeze({mount});
})();
