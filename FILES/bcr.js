const bcrypt = require('bcryptjs');

const plainTextPassword = '1234'; // <-- Change this to the desired password

const salt = bcrypt.genSaltSync(10);
const hash = bcrypt.hashSync(plainTextPassword, salt);

console.log('Your secure password hash is:');
console.log(hash);