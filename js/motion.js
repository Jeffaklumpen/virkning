/* Lightweight, shared animations. No guide data is sent or stored. */
(() => {
  'use strict';
  let sequence=0, activeTransition=null, activeEntrance=null;

  function reducedMotion(){
    return !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  }
  function animateEntry(element, view, oldView, direction){
    if(reducedMotion()||typeof element.animate!=='function')return;
    const changed=oldView!==view;
    const target=changed?element:(
      view==='guide'?element.querySelector('.step-panel'):null
    );
    if(!target || typeof target.animate!=='function')return;
    if(changed)activeEntrance?.cancel();
    const backwards=direction==='back';
    const frames=changed
      ? [{opacity:0,transform:`translate3d(0,${backwards?'-10':'12'}px,0) scale(.995)`},
         {opacity:1,transform:'translate3d(0,0,0) scale(1)'}]
      : [{opacity:0.58,transform:`translate3d(${backwards?'-13':'13'}px,0,0)`},
         {opacity:1,transform:'translate3d(0,0,0)'}];
    const animation=target.animate(frames,{
      duration:changed?295:210,
      easing:'cubic-bezier(.22,1,.36,1)'
    });
    if(changed)activeEntrance=animation;
  }

  function render(element,html,view,{direction='forward',afterMount,scroll=true}={}){
    const token=++sequence;
    const oldView=element.dataset.motionView||'';
    const changed=oldView!==view;
    const apply=()=>{
      if(token!==sequence)return;
      element.innerHTML=html;
      element.dataset.motionView=view;
      if(scroll)window.scrollTo({top:0,behavior:'instant'});
      afterMount?.();
    };

    // Native crossfade (Safari/iPadOS and modern browsers). Skip it for login
    // and asynchronous loading to keep the initial unlock flow synchronous.
    const canCrossfade=changed&&oldView&&
      !['login','loading'].includes(oldView)&&!['login','loading'].includes(view)&&
      !reducedMotion()&&typeof document.startViewTransition==='function';
    if(canCrossfade){
      try{
        activeTransition?.skipTransition?.();
        document.documentElement.dataset.motionDirection=direction;
        const transition=document.startViewTransition(apply);
        activeTransition=transition;
        Promise.resolve(transition.finished).catch(()=>{}).then(()=>{
          if(activeTransition===transition){
            activeTransition=null;
            delete document.documentElement.dataset.motionDirection;
          }
        });
        return;
      }catch{/* Browser may decline a transition; keep navigation working. */}
    }
    apply();
    if(token===sequence)animateEntry(element,view,oldView,direction);
  }

  window.SunbeamMotion=Object.freeze({render,reducedMotion});
})();
