function renderNotes(target,content){target.replaceChildren();String(content||'').split(/\n\n+/).forEach(part=>{const lines=part.split('\n'),section=document.createElement('section'),h=document.createElement('h3'),p=document.createElement('p');section.className='speaker-point';h.textContent=lines.shift();p.textContent=lines.join(' ');section.append(h,p);target.append(section);});}
(() => {
  'use strict';
  const R=IvRemote,$=s=>document.querySelector(s),params=new URLSearchParams(location.hash.slice(1)),host=params.get('host'),token=params.get('token');
  let client;
  try{client=sessionStorage.getItem('iv-remote-client');if(!client){client=R.random();sessionStorage.setItem('iv-remote-client',client);}}catch(_){client=R.random();}
  let peer,conn,authed=false,stopped=false,seq=0,pending=false,lastSeen=0,attempt=0,retryTimer,connectTimer;
  const controls=enabled=>{$('#prev').disabled=!enabled;$('#next').disabled=!enabled;};
  const status=(text)=>{$('#status').textContent=text;};
  function show(s){if(!s||!Number.isInteger(s.index)||!Number.isInteger(s.total))return;$('#title').textContent=String(s.title||'Презентация');$('#number').textContent=`${s.index+1} / ${s.total}`;renderNotes($('#notes'),s.notes);const url=R.preview(s.previewUrl);if(url){if($('#preview').getAttribute('src')!==url){$('#preview').hidden=true;$('#fallback').hidden=false;$('#fallback').textContent='Загрузка статического слайда…';$('#preview').src=url;}}else{$('#preview').removeAttribute('src');$('#preview').hidden=true;$('#fallback').hidden=false;$('#fallback').textContent='Предпросмотр недоступен. Заметки и стрелки работают.';}}
  $('#preview').onload=()=>{$('#preview').hidden=false;$('#fallback').hidden=true;};$('#preview').onerror=()=>{$('#preview').hidden=true;$('#fallback').hidden=false;$('#fallback').textContent='Предпросмотр недоступен. Заметки и стрелки работают.';};
  function stop(text){stopped=true;authed=false;controls(false);clearTimeout(retryTimer);clearTimeout(connectTimer);conn?.close();peer?.destroy();status(text);$('#retry').hidden=true;}
  function lost(){if(stopped)return;authed=false;pending=false;controls(false);clearTimeout(connectTimer);status(attempt>2?'Подключение недоступно. Проверьте интернет или попробуйте другую сеть. Некоторые сети требуют ретранслятор. Повторяем подключение; локальные стрелки работают.':'Связь прервалась. Повторное подключение… На основном экране доступны локальные стрелки.');clearTimeout(retryTimer);retryTimer=setTimeout(connect,Math.min(6000,1000+attempt++*1000));$('#retry').hidden=false;}
  function connect(){
    if(stopped)return;clearTimeout(retryTimer);if(conn){conn.removeAllListeners();conn.close();conn=null;}controls(false);status(attempt?'Повторное подключение…':'Подключение…');
    if(!peer||peer.destroyed){peer=new Peer('ivc-'+R.random(),R.options(window.IV_REMOTE_PEER_OPTIONS));peer.on('open',dial);peer.on('error',lost);peer.on('disconnected',()=>{if(!stopped)try{peer.reconnect();}catch(_){lost();}});}else if(peer.open)dial();else if(peer.disconnected)try{peer.reconnect();}catch(_){lost();}
    clearTimeout(connectTimer);connectTimer=setTimeout(()=>{status('Подключение недоступно. Проверьте интернет или попробуйте другую сеть. Некоторые сети требуют ретранслятор. Локальный показ продолжает работать.');authed=false;controls(false);lost();},15000);
  }
  function dial(){
    if(stopped||(authed&&conn?.open))return;conn=peer.connect(host,{reliable:true,serialization:'json'});const c=conn;
    c.on('open',()=>R.send(c,{type:'auth',v:1,token,client}));c.on('close',()=>{if(conn===c)lost();});c.on('error',()=>{if(conn===c)lost();});
    c.on('data',m=>{if(conn!==c||!m||typeof m!=='object')return;lastSeen=Date.now();
      if(m.type==='rejected'){stop(m.reason==='busy'?'Этот сеанс уже занят другим пультом. Завершите его на основном экране и создайте новый QR.':'QR недействителен. Создайте новый QR на основном экране.');return;}
      if(m.type==='ended'){stop('Сеанс завершён на основном экране. Для подключения отсканируйте новый QR.');return;}
      if(m.type==='ready'){clearTimeout(connectTimer);authed=true;seq=m.ack||0;pending=false;attempt=0;$('#retry').hidden=true;status('Подключено · заметки синхронизированы с экраном');controls(true);return;}
      if(!authed)return;if(m.type==='state'){if(Number.isSafeInteger(m.ack)){seq=m.ack;pending=false;controls(true);}show(m.state);}
    });
  }
  function command(direction){if(!authed||pending)return;pending=true;controls(false);R.send(conn,{type:'command',seq:seq+1,direction});}
  $('#prev').onclick=()=>command('prev');$('#next').onclick=()=>command('next');$('#leave').onclick=()=>{R.send(conn,{type:'leave'});stop('Вы вышли из режима пульта. Отсканируйте новый QR для подключения.');};$('#retry').onclick=()=>{if(!stopped)connect();};
  window.addEventListener('offline',()=>{conn?.close();lost();});window.addEventListener('online',()=>{if(!stopped)connect();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&!stopped){if(authed)R.send(conn,{type:'sync'});else connect();}});
  window.addEventListener('pagehide',()=>{conn?.close();peer?.destroy();});
  window.addEventListener('pageshow',event=>{if(event.persisted&&!stopped){authed=false;connect();}});
  setInterval(()=>{if(authed){if(Date.now()-lastSeen>R.timeout){conn?.close();lost();}else R.send(conn,{type:'ping'});}},R.heartbeat);
  if(!/^iv-[a-f0-9]{64}$/.test(host||'')||!/^[a-f0-9]{64}$/.test(token||''))stop('Откройте QR с экрана презентации: нажмите маленькую кнопку в левом нижнем углу.');else connect();
})();
