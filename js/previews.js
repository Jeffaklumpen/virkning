/* Create lightweight private previews only after the owner opens a guide. */
(() => {
  'use strict';
  function create(pattern){
    const source=window.SunbeamPatterns.picture(pattern,pattern.cover||'cover');
    if(!/^data:image\/(jpeg|png|webp);base64,/i.test(source))return Promise.resolve(null);
    return new Promise(resolve=>{
      const image=new Image();
      image.onload=()=>{
        try{
          const factor=Math.min(1,320/Math.max(image.naturalWidth,image.naturalHeight));
          const canvas=document.createElement('canvas');
          canvas.width=Math.max(1,Math.round(image.naturalWidth*factor));
          canvas.height=Math.max(1,Math.round(image.naturalHeight*factor));
          canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
          const thumb=canvas.toDataURL('image/webp',0.78);
          resolve(/^data:image\/webp;base64,/i.test(thumb)?thumb:null);
        }catch{resolve(null)}
        image.onload=null;image.onerror=null;image.src='';
      };
      image.onerror=()=>resolve(null);
      image.src=source;
    });
  }
  window.SunbeamPreviews=Object.freeze({create});
})();
