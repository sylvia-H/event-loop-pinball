console.log(1);
setTimeout(() => console.log(2), 10);
const end = Date.now() + 30; while (Date.now() < end) {}
console.log(3);
