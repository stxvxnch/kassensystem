// script.js

// Alle Produkte holen
const products = document.querySelectorAll('.product');
const orderList = document.querySelector('.order-list');

products.forEach(product => {
    const plusBtn = product.querySelector('.btn-plus');
    const productName = product.querySelector('.produkt-name').textContent;
    const minusBtn = product.querySelector(".btn-minus");
    const productPrice = product.querySelector('.produkt-preis').textContent;
    const priceNumber = parseFloat(productPrice.replace('€', '').trim());


    // Klick auf + Button
    plusBtn.addEventListener('click', () => {
        addToOrder(productName, priceNumber);
    });

    minusBtn.addEventListener("click", () => {
        deleteFromOrder(productName, priceNumber)
    })
});

// Funktion um Produkt in die Bestellung zu bringen
function addToOrder(name, price) {
    // Prüfen, ob das Produkt schon in der Bestellung ist
    let existingItem = Array.from(orderList.children).find(item => item.dataset.name === name);

    if (existingItem) {
        // Anzahl erhöhen
        let countElem = existingItem.querySelector('.count');
        countElem.textContent = parseInt(countElem.textContent) + 1;
    } else {
        // Neues Produkt erstellen
        const orderItem = document.createElement('div');
        orderItem.className = 'order-item';
        orderItem.dataset.name = name;
        orderItem.dataset.name = price;
        orderItem.innerHTML = `${name} - Menge: <span class="count">1</span>`;
        orderItem.innerHTML = `${price} €`
        orderList.appendChild(orderItem);
        console.log(price)
    }
}

function deleteFromOrder(name, price) {
    let existingItem = Array.from(orderList.children).find(item => item.dataset.name === name)

    if(existingItem){
        let countElem = existingItem.querySelector(".count")
        let currentCount = parseInt(countElem.textContent)

        if(currentCount > 1){
            countElem.textContent = parseInt(countElem.textContent) - 1;
        } else {
            orderList.removeChild(existingItem)
        }
        
    }
}

