// script.js

// Alle Produkte holen
const products = document.querySelectorAll('.product');
const orderList = document.querySelector('.order-list');
const zahlung = document.querySelector('.zahlung')


products.forEach(product => {
    const plusBtn = product.querySelector('.btn-plus');
    const productName = product.querySelector('.produkt-name').textContent;
    const minusBtn = product.querySelector(".btn-minus");
    const productPrice = product.querySelector('.produkt-preis').textContent;
    const priceNumber = parseFloat(productPrice.replace('€', '').trim());
    const payButton = zahlung.querySelector('.btn-bezahlen')
    const reset = document.querySelector(".reset")


    // Klick auf + Button
    plusBtn.addEventListener('click', () => {
        addToOrder(productName, priceNumber);
    });

    minusBtn.addEventListener("click", () => {
        deleteFromOrder(productName, priceNumber)
    })

    plusBtn.addEventListener('click', () => {
        endingPrice();
    })

    minusBtn.addEventListener('click', () => {
        endingPrice();
    })

    payButton.addEventListener('click', ()=>{
        showChange();
    })

    reset.addEventListener('click', ()=>{
        location.reload();
    })
});

// Funktion um Produkt in die Bestellung zu bringen
function addToOrder(name, price) {
    // Prüfen, ob das Produkt schon in der Bestellung ist
    let existingItem = Array.from(orderList.children).find(item => item.dataset.name === name);

    if (existingItem) {
        // Anzahl erhöhen
        let countElem = existingItem.querySelector('.count');
        let countPrice = existingItem.querySelector('.item-price');

        let currentCount = parseInt(countElem.textContent) + 1;
        countElem.textContent = currentCount;

        let totalPrice = currentCount * price;
        countPrice.textContent = totalPrice.toFixed(2) + ' €'
        
    } else {
        // Neues Produkt erstellen
        const orderItem = document.createElement('div');
        orderItem.className = 'order-item';
        orderItem.dataset.name = name;
        orderItem.dataset.price = price;
        orderItem.innerHTML = `
        <strong>${name}</strong> - Menge: <span class="count">1</span>
        - Price: <span class="item-price">${price.toFixed(2)} €</span>
        `;

        orderList.appendChild(orderItem);
        console.log(price)
    }
}

function deleteFromOrder(name, price) {
    let existingItem = Array.from(orderList.children).find(item => item.dataset.name === name)

    if(existingItem){
        let countElem = existingItem.querySelector(".count");
        let countPrice = existingItem.querySelector('.item-price');
        
        let currentCount = parseInt(countElem.textContent);
        if(currentCount > 1){
            let currentCount = parseInt(countElem.textContent) - 1;
            countElem.textContent = currentCount;

            let totalPrice = currentCount * price;
            countPrice.textContent = totalPrice.toFixed(2) + ' €';
        } else {
            orderList.removeChild(existingItem)
        }
        
    }
}

function endingPrice() {
    console.log("funkt")
    const priceContainer = document.querySelector('.current-price')

    const allPrices = document.querySelectorAll('.item-price');
    let totalPrice = 0;

    for (let i = 0; i < allPrices.length; i++) {
        let num = parseFloat(allPrices[i].textContent.replace('€', '').trim());
        if( !isNaN(num)) totalPrice += num;
    }

    let existingPrice = document.querySelector(".endPrice");
    if(existingPrice){
        existingPrice.innerHTML = `
    <strong>Endpreis: <span class="final-price">${totalPrice.toFixed(2)} €</span></strong>
    `
    } else{

    const acutalPrice = document.createElement('div')
    acutalPrice.className = "endPrice"
    acutalPrice.dataset.acutalPrice = totalPrice
    acutalPrice.innerHTML = `
    <strong>Endpreis: <span class="final-price">${totalPrice.toFixed(2)} €</span></strong>
    `

    priceContainer.appendChild(acutalPrice)
    }
}


function showChange(){
    const change = document.querySelector('.rueckgeld');
    const endPrice = document.querySelector('.final-price').textContent;
    let endPriceNumber = parseFloat(endPrice.replace('€', '').trim());

    const givenMoney = document.querySelector('.given-money').value;
    let givenMoneyNumber = parseFloat(givenMoney.replace(',', '.').trim());

    let changeNumber = givenMoneyNumber - endPriceNumber;

    change.innerHTML = `Rückgeld: <strong>${changeNumber.toFixed(2)} €</strong>`


}