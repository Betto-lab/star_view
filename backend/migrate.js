const conexion = require("./db");

conexion.query("ALTER TABLE usuarios ADD COLUMN sesion_version INT DEFAULT 1", (errQuery) => {
    if (errQuery) {
        console.log("Error (o ya existe):", errQuery.message);
    } else {
        console.log("Columna sesion_version añadida con éxito");
    }
    process.exit(0);
});
