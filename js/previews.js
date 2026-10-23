/* Original-photo thumbnails only. Never substitute illustrated SVG pattern art. */
(() => {
  'use strict';
  const isPhoto=value=>typeof value==='string'&&/^data:image\/(jpeg|png|webp);base64,/i.test(value);
  function source(pattern){
    const images=pattern?.images||{};
    const keys=[pattern?.cover,'cover','finished','front','hero',
      ...Object.keys(images).filter(key=>/cover|finished|front|hero|result|photo/i.test(key)),
      ...Object.keys(images)];
    for(const key of keys){
      if(typeof key==='string'&&isPhoto(images[key]))return images[key];
    }
    return null;
  }
  function create(pattern){
    const original=source(pattern);
    if(!original)return Promise.resolve(null);
    return new Promise(resolve=>{
      const image=new Image();
      image.onload=()=>{
        try{
          const factor=Math.min(1,400/Math.max(image.naturalWidth,image.naturalHeight));
          const canvas=document.createElement('canvas');
          canvas.width=Math.max(1,Math.round(image.naturalWidth*factor));
          canvas.height=Math.max(1,Math.round(image.naturalHeight*factor));
          canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
          const thumb=canvas.toDataURL('image/webp',0.82);
          resolve(isPhoto(thumb)?thumb:null);
        }catch{resolve(null)}
        image.onload=null;image.onerror=null;image.src='';
      };
      image.onerror=()=>resolve(null);
      image.src=original;
    });
  }
  window.SunbeamPreviews=Object.freeze({source,create,isPhoto});
})();
