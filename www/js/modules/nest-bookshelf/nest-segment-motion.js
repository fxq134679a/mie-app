(function () {
  if (window.NestSegmentMotion) return;
  const mounted = new WeakMap();
  const css = `
    [data-nest-segment] { position:relative!important; isolation:isolate; }
    [data-nest-segment][data-slide-ready]::before { content:""; position:absolute; pointer-events:none; z-index:0;
      left:0; top:0; width:var(--slide-w); height:var(--slide-h); transform:translate(var(--slide-x),var(--slide-y));
      border-radius:var(--slide-radius,10px); background:var(--slide-fill,var(--nest-segment-fill,#fff));
      box-shadow:var(--slide-shadow,0 1px 4px #0000000d); }
    [data-nest-segment][data-slide-animate]::before { transition:transform 260ms cubic-bezier(.22,1,.36,1),width 260ms cubic-bezier(.22,1,.36,1),height 260ms cubic-bezier(.22,1,.36,1); }
    [data-nest-segment][data-slide-ready][data-slide-ready] > button { position:relative; z-index:1; background:transparent!important; box-shadow:none!important; backdrop-filter:none!important; -webkit-backdrop-filter:none!important; }
    [data-nest-segment="underline"]::before { box-shadow:none; }
    [data-nest-segment="owner"] { --slide-fill:rgba(204,120,92,.10); --slide-shadow:none; }
    :root { --nest-segment-fill:rgba(255,255,255,.92); }
    @media(prefers-color-scheme:dark) { :root:not([data-theme="light"]) { --nest-segment-fill:rgba(255,255,255,.1); } }
    :root[data-theme="dark"] { --nest-segment-fill:rgba(255,255,255,.1); }
    @media(prefers-reduced-motion:reduce) { [data-nest-segment][data-slide-animate]::before { transition:none; } }
  `;
  const style = document.createElement('style'); style.id='nest-segment-motion-style'; style.textContent=css; document.head.append(style);
  function mount(group) {
    if (!group || mounted.has(group)) return mounted.get(group);
    let frame=0, destroyed=false, lastActive=null, interactionTarget=null;
    const update = () => {
      frame=0;
      if (destroyed) return;
      const buttons=[...group.children].filter(el=>el.tagName==='BUTTON');
      const active=buttons.find(el=>el.getAttribute('aria-pressed')==='true' || el.getAttribute('aria-selected')==='true' || el.getAttribute('aria-current')==='page' || el.classList.contains('active'));
      if (!active || !group.offsetWidth || !active.offsetWidth || active.hidden) { lastActive=null;interactionTarget=null;group.removeAttribute('data-slide-ready');group.removeAttribute('data-slide-animate');return; }
      const underline=group.dataset.nestSegment==='underline';
      const values={'--slide-x':active.offsetLeft+'px','--slide-y':(underline ? group.clientHeight-2 : active.offsetTop)+'px','--slide-w':active.offsetWidth+'px','--slide-h':(underline ? 2 : active.offsetHeight)+'px','--slide-radius':underline ? '1px' : getComputedStyle(active).borderRadius};
      if (group.dataset.nestSegment==='discipline') values['--slide-fill']=getComputedStyle(active).getPropertyValue('--active-bg').trim() || 'rgba(120,90,50,.75)';
      const ready=group.hasAttribute('data-slide-ready');
      const changed=Object.entries(values).some(([key,value])=>group.style.getPropertyValue(key)!==value);
      // A resize/count refresh can follow a click; an unchanged measurement must not cancel its animation.
      if (ready && !changed) { lastActive=active;interactionTarget=null;return; }
      const animate=ready && lastActive && active!==lastActive && active===interactionTarget;
      group.toggleAttribute('data-slide-animate',!!animate);
      for (const [key,value] of Object.entries(values)) if (group.style.getPropertyValue(key)!==value) group.style.setProperty(key,value);
      group.setAttribute('data-slide-ready','');
      lastActive=active;interactionTarget=null;
    };
    const schedule=()=>{if(!frame&&!destroyed) frame=requestAnimationFrame(update);};
    // Click also covers keyboard activation. Layout, visibility and data updates are not user switches.
    const onClick=e=>{
      const button=e.target.closest?.('button');
      if(button?.parentElement===group && !button.disabled) { interactionTarget=button;schedule(); }
    };
    group.addEventListener('click',onClick,true);
    const observer=new MutationObserver(records=>{
      if(records.some(r=>r.type==='childList' || r.target!==group)) schedule();
    });
    observer.observe(group,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','aria-pressed','aria-selected','aria-current','hidden','style']});
    const resize=new ResizeObserver(schedule); resize.observe(group);
    const api={update:schedule,destroy(){destroyed=true;cancelAnimationFrame(frame);observer.disconnect();resize.disconnect();group.removeEventListener('click',onClick,true);mounted.delete(group);group.removeAttribute('data-slide-ready');group.removeAttribute('data-slide-animate');}};
    mounted.set(group,api);update();return api;
  }
  function scan(root=document){root.querySelectorAll('[data-nest-segment]').forEach(mount);}
  window.NestSegmentMotion={mount,scan};
  // Fixed main-page controls are initialized once; dynamic sheets initialize before their first interaction.
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>scan(),{once:true}); else scan();
  const prepare=e=>{const group=e.target.closest?.('[data-nest-segment]');if(group) mount(group);};
  document.addEventListener('pointerdown',prepare,true);document.addEventListener('focusin',prepare,true);
})();
