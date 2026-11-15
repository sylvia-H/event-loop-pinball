console.log(1);
Promise.resolve().then(() => console.log(2));
process.nextTick(() => console.log(3));
console.log(4);
