const mysql = require("mysql2");

// USAR CREATE POOL EN VEZ DE CREATE CONNECTION
const conexion = mysql.createPool({
    host: process.env.DB_HOST || process.env.MYSQLHOST || "localhost",
    user: process.env.DB_USER || process.env.MYSQLUSER || "user",
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || "agilemortal",
    database: process.env.DB_NAME || process.env.MYSQLDATABASE || "starview",
    port: process.env.DB_PORT || process.env.MYSQLPORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// PROBAR LA CONEXIÓN INICIAL
conexion.getConnection((error, connection) => {
    if (error) {
        console.error("Error de conexión a la BD en la nube:", error.message);
        return;
    }
    console.log("Conectado a la Base de Datos en la nube (Pool activado)");
    connection.release(); // Liberar la conexión inicial
});

module.exports = conexion;