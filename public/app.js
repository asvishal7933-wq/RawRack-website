let cart = JSON.parse(localStorage.getItem("rr_cart") || "[]");
const money = n => "₹" + Number(n).toLocaleString("en-IN");
function save(){localStorage.setItem("rr_cart",JSON.stringify(cart));renderCart();document.querySelectorAll("#bagCount,#mobileBagCount").forEach(x=>x.textContent=cart.reduce((a,i)=>a+i.quantity,0))}
async function products(){const r=await fetch("/api/products");return r.json()}
function addItem(productId,size="M",color="Concrete Grey",designUrl="",designName="",note=""){
  cart.push({productId,size,color,quantity:1,designUrl,designName,note});save();alert("Added to your RawRack bag.");
}
async function renderHome(){
 const ps=await products(); const el=document.querySelector("[data-products]"); if(!el)return;
 el.innerHTML=ps.map(p=>`<article class="card"><a href="/product.html?id=${p.id}"><div class="cardVisual">${p.id==="hoodie"?'<img src="/assets/diet-coke-hoodie.jpg" style="width:100%;height:100%;object-fit:cover">':`<div class="mock ${p.id} ${p.id==="badge"?"badge":""}"></div>`}</div><div class="cardBody"><span class="tag">${p.category}</span><h3>${p.name}</h3><p>${money(p.price)} <button class="quick" onclick="event.preventDefault();addItem('${p.id}')">ADD +</button></p></div></a></article>`).join("");
}
function openCart(){document.getElementById("cart")?.classList.add("open");renderCart()}
function closeCart(){document.getElementById("cart")?.classList.remove("open")}
async function renderCart(){
 const el=document.getElementById("cartItems");if(!el)return;
 if(!cart.length){el.innerHTML="<p>Your bag is empty.</p>";document.getElementById("cartTotal").textContent="₹0";return}
 const ps=await products(); let total=0;
 el.innerHTML=cart.map((i,n)=>{const p=ps.find(x=>x.id===i.productId);const line=p.price*i.quantity;total+=line;return `<div class="cartRow"><div class="thumb">RR</div><div style="flex:1"><b>${p.name}</b><div style="font-size:11px;margin-top:6px">${i.size} · ${i.color}</div><div style="font-size:12px;margin-top:6px">${money(line)}</div><button style="border:0;background:none;text-decoration:underline;font-size:9px;padding:8px 0" onclick="removeCart(${n})">REMOVE</button></div></div>`}).join("");
 document.getElementById("cartTotal").textContent=money(total)
}
function removeCart(n){cart.splice(n,1);save()}
save();renderHome();

document.addEventListener("DOMContentLoaded",()=>{
 document.querySelectorAll("section,.card,.feature,.about,.social").forEach(x=>x.classList.add("reveal"));
 const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting)e.target.classList.add("in")}),{threshold:.08});
 document.querySelectorAll(".reveal").forEach(x=>io.observe(x));
});
