const products = document.querySelectorAll('.product');
const orderList = document.querySelector('.order-list');
const reset = document.querySelector('.reset');

let orders = {}; // { "Fischsemmel": {count:2, price:3}, ... }

products.forEach(product => {
    const name = product.querySelector('.produkt-name').textContent;
    const basePrice = parseFloat(product.querySelector('.produkt-preis').textContent.replace('€','').trim());

    const btnMinus = product.querySelector('.btn-minus');
    const btnPlus = product.querySelector('.btn-plus');
    const btnPlusPfand = product.querySelector('.btn-plus-pfand');
    const btnPlusNoPfand = product.querySelector('.btn-plus-no-pfand');

    if(btnPlus) btnPlus.addEventListener('click', () => addItem(name, basePrice));
    if(btnPlusPfand) btnPlusPfand.addEventListener('click', () => {
        let pfand = (name.includes("Glühwein") || name.includes("Kinderpunsch") || name.includes("Helles") || name.includes("Wasser") || name.includes("Cola") || name.includes("Cola Light") || name.includes("Apfelschorle")) ? (name.includes("Glühwein") ? 2 : 1) : 0;
        addItem(name + " + Pfand", basePrice + pfand);
    });
    if(btnPlusNoPfand) btnPlusNoPfand.addEventListener('click', () => addItem(name, basePrice));

    btnMinus.addEventListener('click', () => removeItem(name));
});

document.querySelector('.btn-bezahlen').addEventListener('click', showChange);
reset.addEventListener('click', () => {
    orders = {};
    orderList.innerHTML = '';
    document.querySelector('.current-price').innerHTML = '';
    document.querySelector('.given-money').value = '';
    document.querySelector('.rueckgeld').innerHTML = 'Rückgeld: <strong>0,00 €</strong>';
});

function addItem(name, price){
    if(!orders[name]) orders[name] = {count:0, price: price};
    orders[name].count += 1;
    renderOrders();
}

function removeItem(name){
    if(!orders[name]) return;
    orders[name].count -=1;
    if(orders[name].count <=0) delete orders[name];
    renderOrders();
}

function renderOrders(){
    orderList.innerHTML = '';
    let total = 0;
    for(const key in orders){
        const item = orders[key];
        const lineTotal = item.count * item.price;
        total += lineTotal;
        const div = document.createElement('div');
        div.className = 'order-item';
        div.dataset.name = key;
        div.innerHTML = `<strong>${key}</strong> - Menge: <span class="count">${item.count}</span> - Price: <span class="item-price">${lineTotal.toFixed(2)} €</span>`;
        orderList.appendChild(div);
    }
    document.querySelector('.current-price').innerHTML = `<strong>Endpreis: <span class="final-price">${total.toFixed(2)} €</span></strong>`;
}

function showChange(){
    const endPrice = parseFloat(document.querySelector('.final-price')?.textContent.replace('€','').trim() || 0);
    const given = parseFloat(document.querySelector('.given-money').value.replace(',','.') || 0);
    const change = given - endPrice;
    document.querySelector('.rueckgeld').innerHTML = `Rückgeld: <strong>${change.toFixed(2)} €</strong>`;

    // 1️⃣ Daten für Backend vorbereiten
const items = Object.keys(orders).map(name => {
    return {
        productName: name,
        unitPrice: orders[name].price,
        quantity: orders[name].count,
        totalPrice: orders[name].price * orders[name].count
    };
});

const totalPrice = items.reduce((sum, item) => sum + item.totalPrice, 0);

const orderData = {
    totalPrice: totalPrice,
    items: items
};

// 2️⃣ Bestellung an Backend senden
fetch("http://localhost:8080/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(orderData)
})
.then(res => res.json())
.then(data => console.log("Order gespeichert:", data))
.catch(err => console.error("Fehler:", err));

}
