const express = require("express");
const cors = require("cors");
const axios = require("axios");
const bcrypt = require("bcrypt");
const path = require("path");
const dns = require('dns');


require("dotenv").config();



const conexion = require("./db");

const { MercadoPagoConfig, Preference } = require("mercadopago");

const clienteMP = process.env.MP_ACCESS_TOKEN
    ? new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN })
    : null;

const TMDB_API_KEY = "14848f0a935d7e54d7c8ced042603214";    
const app = express();

const registrosPendientes = new Map();
const recuperacionesPerfil = new Map();

function dominioAceptaCorreos(correo) {
    return new Promise((resolve) => {
        const dominio = correo.split('@')[1];

        // Consultamos los Registros MX (Mail Exchange) del dominio
        dns.resolveMx(dominio, (err, direcciones) => {
            if (err || !direcciones || direcciones.length === 0) {
                resolve(false); // El dominio no existe o no acepta correos (Ej: asdasd.com)
            } else {
                resolve(true);  // El dominio es real (Ej: gmail.com)
            }
        });
    });
}

function validarFormatoCorreo(correo) {
    const expresion = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return expresion.test(correo);
}

function validarSoloLetras(texto) {
    const expresion = /^[A-Za-záéíóúÁÉÍÓÚñÑ\s]+$/;
    return expresion.test(texto);
}

function validarPasswordSegura(password) {
    const tieneLongitud = password.length >= 8;
    const tieneNumero = /\d/.test(password);
    const tieneSimbolo = /[!@#$%^&*(),.?":{}|<>_\-+=/\\[\];'`~]/.test(password);

    return tieneLongitud && tieneNumero && tieneSimbolo;
}

function generarCodigoVerificacion() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function enviarCorreoVerificacion(correo, nombre, codigo, tipo = "registro") {
    // Pega aquí la URL que te acaba de dar Google Apps Script
    const urlGoogleScript = "https://script.google.com/macros/s/AKfycbwoBuUvkjHGh0LWHiOJvZfg9HtkalQQNYeRLefQVPVYSXzoOxY_jzRGn342e-ox3NWO/exec";

    try {
        console.log(`[CORREO] Intentando enviar código ${codigo} a: ${correo} (Modo: ${tipo})`);
        
        // Usamos fetch nativo que es más compatible con las redirecciones de Google Apps Script
        const respuesta = await fetch(urlGoogleScript, {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({ correo, nombre, codigo, tipo }),
            redirect: "follow"
        });

        console.log(`[CORREO] Respuesta de Google HTTP: ${respuesta.status}`);
    } catch (error) {
        console.log("[CORREO ERROR] Falló la conexión con Google Script:", error.message);
        throw new Error("Fallo en la API de correos");
    }
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

/* =========================
   REGISTRO Y LOGIN
========================= */
const recuperacionesCuenta = new Map();

// 1. Enviar código para recuperar cuenta principal
app.post("/recuperar-cuenta/iniciar", (req, res) => {
    const { correo } = req.body;
    
    conexion.query("SELECT id, nombre FROM usuarios WHERE correo = ?", [correo], async (error, resultados) => {
        if (error) {
            return res.json({ ok: false, mensaje: "Error del servidor al buscar el correo." });
        }
        
        // AHORA SÍ VALIDA SI EL CORREO EXISTE
        if (resultados.length === 0) {
            return res.json({ ok: false, mensaje: "Este correo no está registrado. Verifica si está bien escrito." });
        }
        
        const codigo = generarCodigoVerificacion();
        recuperacionesCuenta.set(correo, { codigo, creado: Date.now() });

        try {
            // El parámetro extra "cuenta" es para que Google Apps Script sepa qué correo enviar
            await enviarCorreoVerificacion(correo, resultados[0].nombre, codigo, "cuenta");
            res.json({ ok: true, mensaje: "Código enviado exitosamente a tu correo." });
        } catch (e) {
            res.json({ ok: false, mensaje: "El servidor falló al intentar enviar el correo." });
        }
    });
});

// 2. Confirmar código y cambiar la contraseña de la cuenta
app.post("/recuperar-cuenta/confirmar", async (req, res) => {
    const { correo, codigo, nueva_password } = req.body;
    const peticion = recuperacionesCuenta.get(correo);

    if (!peticion || peticion.codigo !== codigo || (Date.now() - peticion.creado > 10 * 60 * 1000)) {
        return res.json({ ok: false, mensaje: "Código inválido o expirado" });
    }

    const passwordHash = await bcrypt.hash(nueva_password, 10);
    conexion.query("UPDATE usuarios SET password = ? WHERE correo = ?", [passwordHash, correo], (error) => {
        if (error) return res.json({ ok: false, mensaje: "Error al actualizar contraseña" });
        recuperacionesCuenta.delete(correo);
        res.json({ ok: true, mensaje: "Contraseña actualizada correctamente" });
    });
});
app.post("/registro", async (req, res) => {
    const { nombre, correo, password } = req.body;

    // 1. Validaciones básicas de formato
    if (!nombre || !correo || !password) {
        return res.json({ ok: false, mensaje: "Completa todos los campos" });
    }

    if (!validarSoloLetras(nombre)) {
        return res.json({ ok: false, mensaje: "El nombre solo puede contener letras y espacios" });
    }

    if (!validarFormatoCorreo(correo)) {
        return res.json({ ok: false, mensaje: "El formato del correo no es válido" });
    }

    if (!validarPasswordSegura(password)) {
        return res.json({ ok: false, mensaje: "La contraseña debe tener mínimo 8 caracteres, 1 número y 1 símbolo" });
    }

    // ==========================================
    // 🔥 AQUÍ ENTRA LA GUILLOTINA BACKEND (DNS) 🔥
    // ==========================================
    const esReal = await dominioAceptaCorreos(correo);
    if (!esReal) {
        return res.json({
            ok: false,
            mensaje: "El dominio del correo no existe o es temporal. Por favor, usa un correo real."
        });
    }
    // ==========================================

    try {
        // Si el correo es 100% real, buscamos si ya está registrado
        conexion.query(
            "SELECT id FROM usuarios WHERE correo = ?",
            [correo],
            async (error, resultados) => {
                if (error) {
                    console.log("Error al verificar correo:", error);
                    return res.json({ ok: false, mensaje: "Error al verificar el correo" });
                }

                if (resultados.length > 0) {
                    return res.json({ ok: false, mensaje: "Este correo ya está registrado" });
                }

                const passwordHash = await bcrypt.hash(password, 10);
                const codigo = generarCodigoVerificacion();

                registrosPendientes.set(correo, {
                    nombre,
                    correo,
                    passwordHash,
                    codigo,
                    creado: Date.now()
                });

                try {
                    await enviarCorreoVerificacion(correo, nombre, codigo, "registro"); // <-- Cambié "perfil" por "registro"

                    res.json({
                        ok: true,
                        mensaje: "Código de verificación enviado a tu correo"
                    });
                } catch (errorCorreo) {
                    console.log("Error al enviar correo de verificación:", errorCorreo);
                    registrosPendientes.delete(correo);
                    res.json({
                        ok: false,
                        mensaje: "No se pudo enviar el correo de verificación. Revisa la configuración."
                    });
                }
            }
        );
    } catch (error) {
        console.log("Error interno en registro:", error);
        res.json({ ok: false, mensaje: "Error interno del servidor" });
    }
});

app.post("/registro/verificar", (req, res) => {
    const { correo, codigo } = req.body;

    if (!correo || !codigo) {
        return res.json({
            ok: false,
            mensaje: "Correo y código son obligatorios"
        });
    }

    const registro = registrosPendientes.get(correo);

    if (!registro) {
        return res.json({
            ok: false,
            mensaje: "No existe una solicitud de registro pendiente"
        });
    }

    const tiempoExpirado = Date.now() - registro.creado > 10 * 60 * 1000;

    if (tiempoExpirado) {
        registrosPendientes.delete(correo);

        return res.json({
            ok: false,
            mensaje: "El código expiró. Regístrate nuevamente"
        });
    }

    if (registro.codigo !== codigo) {
        return res.json({
            ok: false,
            mensaje: "El código de verificación es incorrecto"
        });
    }

    conexion.query(
        "SELECT id FROM usuarios WHERE correo = ?",
        [correo],
        (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json({
                    ok: false,
                    mensaje: "Error al verificar usuario"
                });
            }

            if (resultados.length > 0) {
                registrosPendientes.delete(correo);

                return res.json({
                    ok: false,
                    mensaje: "Este correo ya está registrado"
                });
            }

            conexion.query(
                "INSERT INTO usuarios(nombre, correo, password) VALUES (?, ?, ?)",
                [registro.nombre, registro.correo, registro.passwordHash],
                (error, resultado) => {
                    if (error) {
                        console.log(error);
                        return res.json({
                            ok: false,
                            mensaje: "Error al registrar usuario"
                        });
                    }

                    registrosPendientes.delete(correo);

                    res.json({
                        ok: true,
                        mensaje: "Registro exitoso. Cuenta verificada correctamente",
                        usuario: {
                            id: resultado.insertId,
                            nombre: registro.nombre,
                            correo: registro.correo
                        }
                    });
                }
            );
        }
    );
});

app.post("/login", (req, res) => {
    const { correo, password } = req.body;

    if (!correo || !password) {
        return res.json({
            ok: false,
            mensaje: "Ingresa correo y contraseña"
        });
    }

    conexion.query(
        "SELECT * FROM usuarios WHERE correo = ?",
        [correo],
        async (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json({
                    ok: false,
                    mensaje: "Error en el servidor"
                });
            }

            if (resultados.length === 0) {
                return res.json({
                    ok: false,
                    mensaje: "Correo no registrado"
                });
            }

            const usuario = resultados[0];

            let passwordValida = false;

            try {
                passwordValida = await bcrypt.compare(password, usuario.password);
            } catch (error) {
                passwordValida = false;
            }

            if (!passwordValida && password === usuario.password) {
                passwordValida = true;
            }

            if (!passwordValida) {
                return res.json({
                    ok: false,
                    mensaje: "Contraseña incorrecta"
                });
            }

            res.json({
                ok: true,
                mensaje: "Inicio de sesión correcto",
                usuario: {
                    id: usuario.id,
                    nombre: usuario.nombre,
                    correo: usuario.correo
                }
            });
        }
    );
});

/* =========================
   CONTENIDO
========================= */

app.get("/contenido", (req, res) => {
    conexion.query(
        "SELECT * FROM contenido ORDER BY id DESC",
        (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json([]);
            }

            res.json(resultados);
        }
    );
});

app.get("/contenido/perfil/:perfil_id", (req, res) => {
    const perfil_id = req.params.perfil_id;

    if (!perfil_id) {
        return res.json([]);
    }

    conexion.query(
        "SELECT infantil FROM perfiles WHERE id = ?",
        [perfil_id],
        (error, perfiles) => {
            if (error) {
                console.log(error);
                return res.json([]);
            }

            if (perfiles.length === 0) {
                return res.json([]);
            }

            const esInfantil = Number(perfiles[0].infantil) === 1;

            let sql = "SELECT * FROM contenido";
            const parametros = [];

            if (esInfantil) {
                sql += " WHERE infantil = 1";
            }

            sql += " ORDER BY id DESC";

            conexion.query(sql, parametros, (error, resultados) => {
                if (error) {
                    console.log(error);
                    return res.json([]);
                }

                res.json(resultados);
            });
        }
    );
});

app.get("/contenido/:id", (req, res) => {
    const id = req.params.id;

    conexion.query(
        "SELECT * FROM contenido WHERE id = ?",
        [id],
        (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json({});
            }

            if (resultados.length === 0) {
                return res.json({});
            }

            res.json(resultados[0]);
        }
    );
});

/* =========================
   PERFILES
========================= */

app.get("/perfiles/:usuario_id", (req, res) => {
    const usuario_id = req.params.usuario_id;

    conexion.query(
        `SELECT id, usuario_id, nombre, avatar, infantil
         FROM perfiles
         WHERE usuario_id = ?
         ORDER BY id ASC`,
        [usuario_id],
        (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json([]);
            }

            res.json(resultados);
        }
    );
});

app.post("/perfiles", (req, res) => {
    const { usuario_id, nombre, avatar, infantil, password_perfil } = req.body;

    if (!usuario_id || !nombre || !avatar || !password_perfil) {
        return res.json({
            ok: false,
            mensaje: "Completa nombre, avatar y contraseña del perfil"
        });
    }

    if (password_perfil.length < 4) {
        return res.json({
            ok: false,
            mensaje: "La contraseña del perfil debe tener mínimo 4 caracteres"
        });
    }

    conexion.query(
        "SELECT COUNT(*) AS total FROM perfiles WHERE usuario_id = ?",
        [usuario_id],
        async (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json({
                    ok: false,
                    mensaje: "Error al verificar perfiles"
                });
            }

            if (resultados[0].total >= 5) {
                return res.json({
                    ok: false,
                    mensaje: "Solo puedes crear hasta 5 perfiles"
                });
            }

            const passwordHash = await bcrypt.hash(password_perfil, 10);

            conexion.query(
                `INSERT INTO perfiles(usuario_id, nombre, avatar, infantil, password_perfil)
                 VALUES (?, ?, ?, ?, ?)`,
                [usuario_id, nombre, avatar, infantil ? 1 : 0, passwordHash],
                (error) => {
                    if (error) {
                        console.log(error);
                        return res.json({
                            ok: false,
                            mensaje: "No se pudo crear el perfil"
                        });
                    }

                    res.json({
                        ok: true,
                        mensaje: "Perfil creado correctamente"
                    });
                }
            );
        }
    );
});


app.post("/perfiles/verificar", (req, res) => {
    const { usuario_id, perfil_id, password_perfil } = req.body;

    if (!usuario_id || !perfil_id || !password_perfil) {
        return res.json({
            ok: false,
            mensaje: "Ingresa la contraseña del perfil"
        });
    }

    conexion.query(
        `SELECT id, nombre, infantil, password_perfil
         FROM perfiles
         WHERE id = ? AND usuario_id = ?`,
        [perfil_id, usuario_id],
        async (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json({
                    ok: false,
                    mensaje: "Error al verificar perfil"
                });
            }

            if (resultados.length === 0) {
                return res.json({
                    ok: false,
                    mensaje: "Perfil no encontrado"
                });
            }

            const perfil = resultados[0];

            if (!perfil.password_perfil) {
                return res.json({
                    ok: true,
                    mensaje: "Perfil sin contraseña configurada",
                    perfil: {
                        id: perfil.id,
                        nombre: perfil.nombre,
                        infantil: Number(perfil.infantil) === 1 ? 1 : 0
                    }
                });
            }

            const passwordValida = await bcrypt.compare(password_perfil, perfil.password_perfil);

            if (!passwordValida) {
                return res.json({
                    ok: false,
                    mensaje: "Contraseña de perfil incorrecta"
                });
            }

            res.json({
                ok: true,
                mensaje: "Perfil verificado correctamente",
                perfil: {
                    id: perfil.id,
                    nombre: perfil.nombre,
                    infantil: Number(perfil.infantil) === 1 ? 1 : 0
                }
            });
        }
    );
});

app.post("/perfiles/recuperar-iniciar", (req, res) => {
    const { usuario_id, perfil_id } = req.body;

    if (!usuario_id || !perfil_id) {
        return res.json({
            ok: false,
            mensaje: "Datos incompletos para recuperar contraseña"
        });
    }

    conexion.query(
        `SELECT 
            perfiles.id AS perfil_id,
            perfiles.nombre AS perfil_nombre,
            usuarios.nombre AS usuario_nombre,
            usuarios.correo AS usuario_correo
         FROM perfiles
         INNER JOIN usuarios ON perfiles.usuario_id = usuarios.id
         WHERE perfiles.id = ? AND perfiles.usuario_id = ?`,
        [perfil_id, usuario_id],
        async (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json({
                    ok: false,
                    mensaje: "Error al buscar el perfil"
                });
            }

            if (resultados.length === 0) {
                return res.json({
                    ok: false,
                    mensaje: "Perfil no encontrado"
                });
            }

            const datos = resultados[0];
            const codigo = generarCodigoVerificacion();
            const clave = `${usuario_id}:${perfil_id}`;

            recuperacionesPerfil.set(clave, {
                usuario_id,
                perfil_id,
                codigo,
                creado: Date.now()
            });

            try {
                // AQUÍ LE AGREGAMOS EL "perfil" AL FINAL DE LA FUNCIÓN
                await enviarCorreoVerificacion(
                    datos.usuario_correo,
                    datos.usuario_nombre,
                    codigo,
                    "perfil"
                );

                res.json({
                    ok: true,
                    mensaje: "Código enviado al correo del usuario"
                });

            } catch (errorCorreo) {
                console.log("Error al enviar código de recuperación de perfil:", errorCorreo);

                recuperacionesPerfil.delete(clave);

                res.json({
                    ok: false,
                    mensaje: "No se pudo enviar el código de recuperación"
                });
            }
        }
    );
});

app.post("/perfiles/recuperar-confirmar", (req, res) => {
    const { usuario_id, perfil_id, codigo, nueva_password } = req.body;

    if (!usuario_id || !perfil_id || !codigo || !nueva_password) {
        return res.json({
            ok: false,
            mensaje: "Completa código y nueva contraseña"
        });
    }

    if (nueva_password.length < 4) {
        return res.json({
            ok: false,
            mensaje: "La nueva contraseña debe tener mínimo 4 caracteres"
        });
    }

    const clave = `${usuario_id}:${perfil_id}`;
    const recuperacion = recuperacionesPerfil.get(clave);

    if (!recuperacion) {
        return res.json({
            ok: false,
            mensaje: "No existe una solicitud de recuperación pendiente"
        });
    }

    const tiempoExpirado = Date.now() - recuperacion.creado > 10 * 60 * 1000;

    if (tiempoExpirado) {
        recuperacionesPerfil.delete(clave);

        return res.json({
            ok: false,
            mensaje: "El código expiró. Solicita uno nuevo"
        });
    }

    if (recuperacion.codigo !== codigo) {
        return res.json({
            ok: false,
            mensaje: "El código ingresado es incorrecto"
        });
    }

    bcrypt.hash(nueva_password, 10, (errorHash, passwordHash) => {
        if (errorHash) {
            console.log(errorHash);
            return res.json({
                ok: false,
                mensaje: "Error al proteger la nueva contraseña"
            });
        }

        conexion.query(
            `UPDATE perfiles
             SET password_perfil = ?
             WHERE id = ? AND usuario_id = ?`,
            [passwordHash, perfil_id, usuario_id],
            (error) => {
                if (error) {
                    console.log(error);
                    return res.json({
                        ok: false,
                        mensaje: "No se pudo actualizar la contraseña del perfil"
                    });
                }

                recuperacionesPerfil.delete(clave);

                res.json({
                    ok: true,
                    mensaje: "Contraseña del perfil actualizada correctamente"
                });
            }
        );
    });
});

/* =========================
   MI LISTA
========================= */

app.post("/mi-lista", (req, res) => {
    const { perfil_id, contenido_id } = req.body;

    if (!perfil_id || !contenido_id) {
        return res.json({
            ok: false,
            mensaje: "Datos incompletos para Mi Lista"
        });
    }

    conexion.query(
        "SELECT * FROM mi_lista WHERE perfil_id = ? AND contenido_id = ?",
        [perfil_id, contenido_id],
        (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json({
                    ok: false,
                    mensaje: "Error al verificar Mi Lista"
                });
            }

            if (resultados.length > 0) {
                return res.json({
                    ok: true,
                    mensaje: "Este contenido ya está en Mi Lista"
                });
            }

            conexion.query(
                "INSERT INTO mi_lista(perfil_id, contenido_id) VALUES (?, ?)",
                [perfil_id, contenido_id],
                (error) => {
                    if (error) {
                        console.log(error);
                        return res.json({
                            ok: false,
                            mensaje: "No se pudo agregar a Mi Lista"
                        });
                    }

                    res.json({
                        ok: true,
                        mensaje: "Agregado a Mi Lista"
                    });
                }
            );
        }
    );
});

app.get("/mi-lista/:perfil_id", (req, res) => {
    const perfil_id = req.params.perfil_id;

    conexion.query(
        `SELECT contenido.*
         FROM mi_lista
         INNER JOIN contenido ON mi_lista.contenido_id = contenido.id
         WHERE mi_lista.perfil_id = ?
         ORDER BY mi_lista.id DESC`,
        [perfil_id],
        (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json([]);
            }

            res.json(resultados);
        }
    );
});

app.delete("/mi-lista/:perfil_id/:contenido_id", (req, res) => {
    const { perfil_id, contenido_id } = req.params;

    conexion.query(
        "DELETE FROM mi_lista WHERE perfil_id = ? AND contenido_id = ?",
        [perfil_id, contenido_id],
        (error) => {
            if (error) {
                console.log(error);
                return res.json({
                    ok: false,
                    mensaje: "No se pudo eliminar"
                });
            }

            res.json({
                ok: true,
                mensaje: "Eliminado de Mi Lista"
            });
        }
    );
});

/* =========================
   HISTORIAL / CONTINUAR VIENDO
========================= */

app.post("/historial", (req, res) => {
    const { perfil_id, contenido_id } = req.body;

    if (!perfil_id || !contenido_id) {
        return res.json({
            ok: false,
            mensaje: "Datos incompletos para historial"
        });
    }

    conexion.query(
        "SELECT id FROM historial WHERE perfil_id = ? AND contenido_id = ? AND terminado = 0 LIMIT 1",
        [perfil_id, contenido_id],
        (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json({
                    ok: false,
                    mensaje: "Error al consultar historial"
                });
            }

            if (resultados.length > 0) {
                return res.json({
                    ok: true,
                    mensaje: "Historial ya existe"
                });
            }

            conexion.query(
                `INSERT INTO historial
                 (perfil_id, contenido_id, minuto_actual, porcentaje, terminado)
                 VALUES (?, ?, 0, 0, 0)`,
                [perfil_id, contenido_id],
                (error) => {
                    if (error) {
                        console.log(error);
                        return res.json({
                            ok: false,
                            mensaje: "Error al registrar historial"
                        });
                    }

                    res.json({
                        ok: true,
                        mensaje: "Historial registrado"
                    });
                }
            );
        }
    );
});

app.get("/continuar/:perfil_id", (req, res) => {
    const perfil_id = req.params.perfil_id;

    conexion.query(
        `SELECT 
            contenido.*,
            historial.minuto_actual,
            historial.porcentaje
         FROM historial
         INNER JOIN contenido ON historial.contenido_id = contenido.id
         WHERE historial.perfil_id = ?
         AND historial.terminado = 0
         ORDER BY historial.id DESC`,
        [perfil_id],
        (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json([]);
            }

            res.json(resultados);
        }
    );
});

app.put("/historial/visto/:id", (req, res) => {
    const contenido_id = req.params.id;
    const { perfil_id } = req.body;

    let sql = `UPDATE historial
               SET terminado = 1, porcentaje = 100
               WHERE contenido_id = ?`;
    const parametros = [contenido_id];

    if (perfil_id) {
        sql += " AND perfil_id = ?";
        parametros.push(perfil_id);
    }

    conexion.query(sql, parametros, (error) => {
        if (error) {
            console.log(error);
            return res.json({
                ok: false,
                mensaje: "Error al marcar como visto"
            });
        }

        res.json({
            ok: true,
            mensaje: "Contenido marcado como visto"
        });
    });
});

app.put("/historial/progreso", (req, res) => {
    const { perfil_id, contenido_id, minuto_actual, porcentaje } = req.body;

    if (!perfil_id || !contenido_id) {
        return res.json({
            ok: false,
            mensaje: "Contenido o perfil no válido"
        });
    }

    conexion.query(
        `UPDATE historial
         SET minuto_actual = ?, porcentaje = ?
         WHERE perfil_id = ?
         AND contenido_id = ?
         AND terminado = 0`,
        [
            minuto_actual || 0,
            porcentaje || 0,
            perfil_id,
            contenido_id
        ],
        (error) => {
            if (error) {
                console.log(error);
                return res.json({
                    ok: false,
                    mensaje: "Error al actualizar progreso"
                });
            }

            res.json({
                ok: true,
                mensaje: "Progreso actualizado"
            });
        }
    );
});

/* =========================
   TMDb
========================= */

app.get("/tmdb/populares", async (req, res) => {
    try {
        const respuesta = await axios.get(
            "https://api.themoviedb.org/3/movie/popular",
            {
                params: {
                    api_key: TMDB_API_KEY,
                    language: "es-ES",
                    page: 1
                }
            }
        );

        const peliculas = respuesta.data.results.map((pelicula) => ({
            tmdb_id: pelicula.id,
            titulo: pelicula.title,
            descripcion: pelicula.overview,
            imagen: pelicula.poster_path
                ? `https://image.tmdb.org/t/p/w500${pelicula.poster_path}`
                : "",
            fondo: pelicula.backdrop_path
                ? `https://image.tmdb.org/t/p/original${pelicula.backdrop_path}`
                : "",
            fecha_estreno: pelicula.release_date || null,
            calificacion: pelicula.vote_average || 0,
            tipo: "pelicula",
            genero: "TMDb",
            origen: "tmdb"
        }));

        res.json(peliculas);
    } catch (error) {
        console.log("Error al obtener populares de TMDb:", error.message);
        res.json([]);
    }
});

app.get("/tmdb/sincronizar", async (req, res) => {
    try {
        let totalInsertados = 0;
        let totalActualizados = 0;
        let totalErrores = 0;

        const paginas = [1, 2];

        for (const pagina of paginas) {
            const respuesta = await axios.get(
                "https://api.themoviedb.org/3/movie/popular",
                {
                    params: {
                        api_key: TMDB_API_KEY,
                        language: "es-ES",
                        page: pagina
                    }
                }
            );

            const peliculas = respuesta.data.results || [];

            for (const pelicula of peliculas) {
                try {
                    const detalle = await axios.get(
                        `https://api.themoviedb.org/3/movie/${pelicula.id}`,
                        {
                            params: {
                                api_key: TMDB_API_KEY,
                                language: "es-ES"
                            }
                        }
                    );

                    const p = detalle.data;

                    const genero = p.genres && p.genres.length > 0
                        ? p.genres.map(g => g.name).join(", ")
                        : "Sin género";

                    const imagen = p.poster_path
                        ? `https://image.tmdb.org/t/p/w500${p.poster_path}`
                        : "";

                    const fondo = p.backdrop_path
                        ? `https://image.tmdb.org/t/p/original${p.backdrop_path}`
                        : "";

                    const generoMinuscula = genero.toLowerCase();

                    const esInfantil =
                        generoMinuscula.includes("familia") ||
                        generoMinuscula.includes("animación") ||
                        generoMinuscula.includes("animacion");

                    await new Promise((resolve) => {
                        conexion.query(
                            `INSERT INTO contenido
                             (titulo, tipo, genero, descripcion, imagen, fondo, tmdb_id, fecha_estreno, calificacion, origen, infantil)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                             ON DUPLICATE KEY UPDATE
                                titulo = VALUES(titulo),
                                tipo = VALUES(tipo),
                                genero = VALUES(genero),
                                descripcion = VALUES(descripcion),
                                imagen = VALUES(imagen),
                                fondo = VALUES(fondo),
                                fecha_estreno = VALUES(fecha_estreno),
                                calificacion = VALUES(calificacion),
                                origen = VALUES(origen),
                                infantil = VALUES(infantil)`,
                            [
                                p.title,
                                "pelicula",
                                genero,
                                p.overview || "Sin descripción disponible.",
                                imagen,
                                fondo,
                                p.id,
                                p.release_date || null,
                                p.vote_average || 0,
                                "tmdb",
                                esInfantil ? 1 : 0
                            ],
                            (error, resultado) => {
                                if (error) {
                                    console.log("Error al sincronizar película:", error);
                                    totalErrores++;
                                    return resolve();
                                }

                                if (resultado.affectedRows === 1) {
                                    totalInsertados++;
                                } else {
                                    totalActualizados++;
                                }

                                resolve();
                            }
                        );
                    });

                } catch (errorPelicula) {
                    console.log("Error al obtener detalle de película:", errorPelicula.message);
                    totalErrores++;
                }
            }
        }

        res.json({
            ok: true,
            mensaje: "Sincronización con TMDb completada",
            insertados: totalInsertados,
            actualizados: totalActualizados,
            errores: totalErrores
        });

    } catch (error) {
        console.log("Error general al sincronizar TMDb:", error.message);

        res.json({
            ok: false,
            mensaje: "No se pudo sincronizar con TMDb",
            error: error.message
        });
    }
});

app.post("/tmdb/importar", async (req, res) => {
    const { tmdb_id } = req.body;

    if (!tmdb_id) {
        return res.json({
            error: true,
            mensaje: "tmdb_id no válido"
        });
    }

    conexion.query(
        "SELECT * FROM contenido WHERE tmdb_id = ?",
        [tmdb_id],
        async (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json({
                    error: true,
                    mensaje: "Error al buscar contenido en MariaDB"
                });
            }

            if (resultados.length > 0) {
                return res.json(resultados[0]);
            }

            try {
                const respuesta = await axios.get(
                    `https://api.themoviedb.org/3/movie/${tmdb_id}`,
                    {
                        params: {
                            api_key: TMDB_API_KEY,
                            language: "es-ES"
                        }
                    }
                );

                const p = respuesta.data;
                const genero = p.genres ? p.genres.map(g => g.name).join(", ") : "Sin género";
                const imagen = p.poster_path ? `https://image.tmdb.org/t/p/w500${p.poster_path}` : "";
                const fondo = p.backdrop_path ? `https://image.tmdb.org/t/p/original${p.backdrop_path}` : "";

                conexion.query(
                    `INSERT INTO contenido
                     (titulo, tipo, genero, descripcion, imagen, fondo, tmdb_id, fecha_estreno, calificacion, origen)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        p.title,
                        "pelicula",
                        genero,
                        p.overview || "Sin descripción disponible.",
                        imagen,
                        fondo,
                        p.id,
                        p.release_date || null,
                        p.vote_average || 0,
                        "tmdb"
                    ],
                    (error, resultado) => {
                        if (error) {
                            console.log(error);
                            return res.json({
                                error: true,
                                mensaje: "Error al guardar contenido de TMDb"
                            });
                        }

                        res.json({
                            id: resultado.insertId,
                            titulo: p.title,
                            tipo: "pelicula",
                            genero,
                            descripcion: p.overview || "Sin descripción disponible.",
                            imagen,
                            fondo,
                            tmdb_id: p.id,
                            fecha_estreno: p.release_date || null,
                            calificacion: p.vote_average || 0,
                            origen: "tmdb"
                        });
                    }
                );
            } catch (error) {
                console.log("Error al consultar TMDb:", error.message);
                res.json({
                    error: true,
                    mensaje: "No se pudo obtener la película desde TMDb"
                });
            }
        }
    );
});

/* =========================
   PLANES, PAGO, FACTURACIÓN
========================= */

app.get("/planes", (req, res) => {
    conexion.query(
        "SELECT * FROM planes ORDER BY precio ASC",
        (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json([]);
            }

            res.json(resultados);
        }
    );
});

/* =========================================
   3. REGISTRO DE PAGO Y ENVÍO DE BOLETA (VÍA GOOGLE SCRIPT)
========================================= */
app.post("/pagos", (req, res) => {
    const { usuario_id, plan_id, metodo_pago, monto } = req.body;
    
    // Código único para la boleta (Ej: BOLETA-SV-847261)
    const codigo_comprobante = "BOLETA-SV-" + Math.floor(Math.random() * 100000000);

    conexion.query("SELECT nombre, correo FROM usuarios WHERE id = ?", [usuario_id], (errUsuario, usuarios) => {
        if (errUsuario || usuarios.length === 0) return res.json({ ok: false, mensaje: "Usuario no encontrado" });
        const usuario = usuarios[0];

        conexion.query("SELECT nombre FROM planes WHERE id = ?", [plan_id], (errPlan, planes) => {
            if (errPlan || planes.length === 0) return res.json({ ok: false, mensaje: "Plan no encontrado" });
            const planNombre = planes[0].nombre;

            // Registrar el pago
            conexion.query(
                "INSERT INTO pagos (usuario_id, plan_id, metodo_pago, monto, estado, codigo_comprobante) VALUES (?, ?, ?, ?, 'pagado', ?)",
                [usuario_id, plan_id, metodo_pago, monto, codigo_comprobante],
                (errPago) => {
                    if (errPago) return res.json({ ok: false, mensaje: "Error al registrar el pago" });

                    // Desactivar planes viejos y activar el nuevo por 1 mes
                    conexion.query(
                        "UPDATE suscripciones SET estado = 'cancelada' WHERE usuario_id = ? AND estado = 'activa'",
                        [usuario_id],
                        () => {
                            conexion.query(
                                "INSERT INTO suscripciones (usuario_id, plan_id, fecha_inicio, fecha_fin) VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 1 MONTH))",
                                [usuario_id, plan_id],
                                async (errSuscripcion) => {
                                    if (errSuscripcion) return res.json({ ok: false, mensaje: "Error al activar suscripción" });

                                    // ENVIAR A GOOGLE APPS SCRIPT
                                    const fechaHoy = new Date().toLocaleDateString('es-PE');
                                    
                                    try {
                                        await axios.post(process.env.GOOGLE_SCRIPT_URL, {
                                            tipo: "boleta",
                                            correo: usuario.correo,
                                            nombre: usuario.nombre,
                                            monto: Number(monto).toFixed(2),
                                            planNombre: planNombre,
                                            codigo_comprobante: codigo_comprobante,
                                            metodo_pago: metodo_pago,
                                            fecha: fechaHoy
                                        });
                                    } catch (errorCorreo) {
                                        console.log("Error contactando a Google Script:", errorCorreo.message);
                                    }

                                    res.json({ ok: true, mensaje: "Suscripción activada y boleta enviada." });
                                }
                            );
                        }
                    );
                }
            );
        });
    });
});
/* =========================================
   1. CÁLCULO DE PRORRATEO Y REGLAS DE NEGOCIO
========================================= */
app.get("/api/pagos/calcular/:usuario_id/:nuevo_plan_id", (req, res) => {
    const { usuario_id, nuevo_plan_id } = req.params;

    conexion.query("SELECT id, precio, nombre FROM planes WHERE id = ?", [nuevo_plan_id], (err1, planes) => {
        if (err1 || planes.length === 0) return res.json({ ok: false, mensaje: "Plan no encontrado" });
        const nuevoPlan = planes[0];

        conexion.query(`
            SELECT s.plan_id, s.fecha_inicio, s.fecha_fin, p.precio as precio_actual, p.nombre as nombre_actual
            FROM suscripciones s
            JOIN planes p ON s.plan_id = p.id
            WHERE s.usuario_id = ? AND s.estado = 'activa'
            ORDER BY s.id DESC LIMIT 1
        `, [usuario_id], (err2, suscripciones) => {
            if (err2) return res.json({ ok: false, mensaje: "Error de servidor" });

            let precio_final = Number(nuevoPlan.precio);
            let descuento = 0;
            let dias_restantes = 0;
            let es_upgrade = false;
            let mensaje_minimo = false;

            // Si el usuario ya tiene una suscripción activa
            if (suscripciones.length > 0) {
                const sub = suscripciones[0];

                // ESCENARIO JURADO 1: Intenta comprar el mismo plan
                if (String(sub.plan_id) === String(nuevo_plan_id)) {
                    return res.json({ ok: false, mensaje: "Ya tienes este plan activo actualmente." });
                }

                // ESCENARIO JURADO 2: Intenta bajar a un plan más barato
                if (Number(nuevoPlan.precio) < Number(sub.precio_actual)) {
                    return res.json({ ok: false, mensaje: "No puedes cambiar a un plan inferior mientras tu suscripción actual siga activa." });
                }

                // ESCENARIO 3: Sube de plan correctamente (Upgrade)
                const hoy = new Date();
                const fechaFin = new Date(sub.fecha_fin);
                const diferenciaMilisegundos = fechaFin - hoy;
                dias_restantes = Math.ceil(diferenciaMilisegundos / (1000 * 60 * 60 * 24));

                if (dias_restantes > 0) {
                    es_upgrade = true;
                    const precioPorDia = Number(sub.precio_actual) / 30;
                    descuento = precioPorDia * dias_restantes;
                    precio_final = precio_final - descuento;

                    // ESCENARIO JURADO 3: El mínimo de Mercado Pago
                    if (precio_final < 3.00) {
                        precio_final = 3.00;
                        mensaje_minimo = true; // Avisamos al frontend para que muestre la advertencia
                    }
                }
            }

            res.json({
                ok: true,
                plan_nombre: nuevoPlan.nombre,
                precio_original: Number(nuevoPlan.precio).toFixed(2),
                descuento: descuento.toFixed(2),
                total_pagar: precio_final.toFixed(2),
                dias_restantes: dias_restantes,
                es_upgrade: es_upgrade,
                mensaje_minimo: mensaje_minimo
            });
        });
    });
});
/* =========================================
   2. CREAR PREFERENCIA MERCADO PAGO CON DESCUENTO APLICADO
========================================= */
app.post("/mercadopago/crear-preferencia", (req, res) => {
    const { usuario_id, plan_id, monto_calculado } = req.body;

    if (!usuario_id || !plan_id) return res.json({ ok: false, mensaje: "Faltan datos" });

    conexion.query("SELECT * FROM planes WHERE id = ?", [plan_id], async (err, resultados) => {
        if (err || resultados.length === 0) return res.json({ ok: false, mensaje: "Plan no encontrado" });

        const plan = resultados[0];
        const precioCobrar = monto_calculado ? Number(monto_calculado) : Number(plan.precio);

        try {
            const body = {
                items: [
                    {
                        id: String(plan.id),
                        title: `Suscripción StarView - Plan ${plan.nombre}`,
                        quantity: 1,
                        unit_price: precioCobrar, 
                        currency_id: "PEN"
                    }
                ],
                back_urls: {
                    success: `${process.env.BASE_URL}/pago-exitoso.html?usuario_id=${usuario_id}&plan_id=${plan.id}&monto=${precioCobrar}`,
                    failure: `${process.env.BASE_URL}/pago-fallido.html`,
                    pending: `${process.env.BASE_URL}/pago-pendiente.html`
                },
                auto_return: "approved"
            };

            const preference = new Preference(clienteMP);
            const respuesta = await preference.create({ body });

            res.json({ ok: true, init_point: respuesta.init_point, sandbox_init_point: respuesta.sandbox_init_point });
        } catch (error) {
            console.error("Error al crear preferencia:", error);
            res.json({ ok: false, mensaje: "Error al generar enlace de pago" });
        }
    });
});
app.get("/facturacion/:usuario_id", (req, res) => {
    const usuario_id = req.params.usuario_id;

    conexion.query(
        `SELECT p.*, pl.nombre AS plan_nombre
         FROM pagos p
         INNER JOIN planes pl ON p.plan_id = pl.id
         WHERE p.usuario_id = ?
         ORDER BY p.fecha_pago DESC`,
        [usuario_id],
        (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json([]);
            }

            res.json(resultados);
        }
    );
});

app.get("/recibo/:id", (req, res) => {
    const id = req.params.id;

    conexion.query(
        `SELECT
            pagos.id,
            pagos.monto,
            pagos.metodo_pago,
            pagos.estado,
            pagos.fecha_pago,
            planes.nombre AS plan,
            usuarios.nombre AS usuario,
            usuarios.correo
         FROM pagos
         INNER JOIN planes ON pagos.plan_id = planes.id
         INNER JOIN usuarios ON pagos.usuario_id = usuarios.id
         WHERE pagos.id = ?`,
        [id],
        (error, resultados) => {
            if (error || resultados.length === 0) {
                return res.send("Recibo no encontrado");
            }

            const pago = resultados[0];

            res.send(`
                <!DOCTYPE html>
                <html lang="es">
                <head>
                    <meta charset="UTF-8">
                    <title>Recibo StarView</title>
                    <style>
                        body{
                            margin:0;
                            min-height:100vh;
                            font-family: Arial, sans-serif;
                            background:#090b13;
                            color:#f5f5f5;
                            display:flex;
                            align-items:center;
                            justify-content:center;
                            padding:40px;
                        }
                        .recibo{
                            width:100%;
                            max-width:680px;
                            background:linear-gradient(145deg,#111827,#0f1016);
                            border:1px solid rgba(255,255,255,.12);
                            border-radius:22px;
                            padding:34px;
                            box-shadow:0 25px 80px rgba(0,0,0,.45);
                        }
                        h1{
                            color:#e50914;
                            margin:0;
                            letter-spacing:2px;
                        }
                        h2{
                            margin-top:8px;
                            color:#fff;
                        }
                        .fila{
                            padding:12px 0;
                            border-bottom:1px solid rgba(255,255,255,.08);
                        }
                        button{
                            margin-top:24px;
                            padding:13px 22px;
                            background:#e50914;
                            color:white;
                            border:none;
                            border-radius:999px;
                            cursor:pointer;
                            font-weight:bold;
                        }
                    </style>
                </head>
                <body>
                    <div class="recibo">
                        <h1>STARVIEW</h1>
                        <h2>Recibo de pago</h2>

                        <div class="fila"><strong>N° Recibo:</strong> ${pago.id}</div>
                        <div class="fila"><strong>Usuario:</strong> ${pago.usuario}</div>
                        <div class="fila"><strong>Correo:</strong> ${pago.correo}</div>
                        <div class="fila"><strong>Plan:</strong> ${pago.plan}</div>
                        <div class="fila"><strong>Monto:</strong> S/ ${pago.monto}</div>
                        <div class="fila"><strong>Método:</strong> ${pago.metodo_pago}</div>
                        <div class="fila"><strong>Estado:</strong> ${pago.estado}</div>
                        <div class="fila"><strong>Fecha:</strong> ${new Date(pago.fecha_pago).toLocaleString()}</div>

                        <button onclick="window.print()">Descargar / imprimir PDF</button>
                    </div>
                </body>
                </html>
            `);
        }
    );
});

app.get("/suscripcion/:usuario_id", (req, res) => {
    const usuario_id = req.params.usuario_id;

    conexion.query(
        `SELECT
            suscripciones.id,
            suscripciones.estado,
            suscripciones.fecha_inicio,
            suscripciones.fecha_cancelacion,
            suscripciones.renovacion_automatica,
            suscripciones.motivo_cancelacion,
            suscripciones.fecha_fin,
            planes.nombre AS plan,
            planes.precio
         FROM suscripciones
         INNER JOIN planes ON suscripciones.plan_id = planes.id
         WHERE suscripciones.usuario_id = ?
         ORDER BY suscripciones.id DESC
         LIMIT 1`,
        [usuario_id],
        (error, resultados) => {
            if (error) {
                console.log(error);
                return res.json({});
            }

            if (resultados.length === 0) {
                return res.json({});
            }

            res.json(resultados[0]);
        }
    );
});

app.put("/suscripcion/cancelar/:id", (req, res) => {
    const id = req.params.id;
    const { motivo_cancelacion } = req.body;

    if (!motivo_cancelacion) {
        return res.json({
            ok: false,
            mensaje: "Debe ingresar un motivo de cancelación"
        });
    }

    const fechaFin = new Date();
    fechaFin.setMonth(fechaFin.getMonth() + 1);
    const fechaFinSQL = fechaFin.toISOString().split("T")[0];

    conexion.query(
        `UPDATE suscripciones
         SET estado = 'cancelada',
             renovacion_automatica = 0,
             motivo_cancelacion = ?,
             fecha_cancelacion = NOW(),
             fecha_fin = ?
         WHERE id = ?`,
        [motivo_cancelacion, fechaFinSQL, id],
        (error) => {
            if (error) {
                console.log(error);
                return res.json({
                    ok: false,
                    mensaje: "No se pudo cancelar la suscripción"
                });
            }

            res.json({
                ok: true,
                mensaje: "Suscripción cancelada. Mantendrás acceso hasta el fin del mes pagado."
            });
        }
    );
});
/* =========================================
   SISTEMA DE RECOMENDACIONES LOCALES (MULTI-GÉNERO)
========================================= */
app.get("/api/recomendaciones/:genero/:id_actual", (req, res) => {
    const { genero, id_actual } = req.params;

    // 1. Separamos los géneros por comas, quitamos espacios extra y los unimos con un "OR" lógico (|)
    const generosArray = genero.split(',').map(g => g.trim());
    const regexPattern = generosArray.join('|');

    // 2. Usamos REGEXP en MariaDB/MySQL para buscar CUALQUIERA de esas palabras
    conexion.query(
        "SELECT * FROM contenido WHERE genero REGEXP ? AND id != ? LIMIT 6",
        [regexPattern, id_actual],
        (error, resultados) => {
            if (error) {
                console.log("Error buscando recomendaciones:", error);
                return res.json([]);
            }
            res.json(resultados);
        }
    );
});

/* =========================================
   RUTAS PARA CASOS DE PRUEBA (HU03 Y HU15)
========================================= */

// HU03-TC03: Editar un perfil existente
app.put("/perfiles/:id", (req, res) => {
    const { id } = req.params;
    const { nombre, avatar, infantil } = req.body;
    
    conexion.query(
        "UPDATE perfiles SET nombre = ?, avatar = ?, infantil = ? WHERE id = ?",
        [nombre, avatar, infantil ? 1 : 0, id],
        (error) => {
            if (error) return res.json({ ok: false, mensaje: "Error al actualizar perfil" });
            res.json({ ok: true, mensaje: "Perfil actualizado correctamente" });
        }
    );
});

// HU03-TC04: Eliminar un perfil existente
app.delete("/perfiles/:id", (req, res) => {
    const { id } = req.params;
    // Eliminamos en cascada: Historial -> Mi lista -> Perfil
    conexion.query("DELETE FROM historial WHERE perfil_id = ?", [id], () => {
        conexion.query("DELETE FROM mi_lista WHERE perfil_id = ?", [id], () => {
            conexion.query("DELETE FROM perfiles WHERE id = ?", [id], (error) => {
                if (error) return res.json({ ok: false, mensaje: "Error al eliminar perfil" });
                res.json({ ok: true, mensaje: "Perfil eliminado correctamente" });
            });
        });
    });
});

// HU15: Sugerencias basadas en el género más visto del perfil
app.get("/recomendaciones/historial/:perfil_id", (req, res) => {
    const { perfil_id } = req.params;
    
    conexion.query(
        `SELECT c.genero, COUNT(*) as vistas
         FROM historial h
         INNER JOIN contenido c ON h.contenido_id = c.id
         WHERE h.perfil_id = ?
         GROUP BY c.genero
         ORDER BY vistas DESC
         LIMIT 1`,
        [perfil_id],
        (error, resultados) => {
            if (error || resultados.length === 0) {
                return res.json({ ok: false, mensaje: "No hay historial suficiente" });
            }

            const generoFavorito = resultados[0].genero.split(',')[0].trim();

            conexion.query(
                `SELECT c.* FROM contenido c
                 WHERE c.genero LIKE ? 
                 AND c.id NOT IN (SELECT contenido_id FROM historial WHERE perfil_id = ? AND terminado = 1)
                 LIMIT 12`,
                [`%${generoFavorito}%`, perfil_id],
                (err, peliculas) => {
                    if (err) return res.json({ ok: false });
                    res.json({ ok: true, genero: generoFavorito, recomendaciones: peliculas });
                }
            );
        }
    );
});

/* =========================================
   CONTROL DE PANTALLAS SIMULTÁNEAS Y CALIDAD
========================================= */

// 1. Verificar disponibilidad e iniciar reproducción
app.post("/api/stream/iniciar", (req, res) => {
    const { usuario_id, dispositivo_token } = req.body;

    if (!usuario_id || !dispositivo_token) {
        return res.json({ ok: false, mensaje: "Faltan datos de sesión." });
    }

    // SOLUCIÓN: Usamos DATE_SUB(NOW()) de MySQL para evitar problemas de zona horaria con Vercel
    conexion.query(
        "DELETE FROM reproducciones_activas WHERE ultima_actividad < DATE_SUB(NOW(), INTERVAL 25 SECOND)",
        (errLimpieza) => {
            if (errLimpieza) console.error("Error limpiando sesiones:", errLimpieza);

            conexion.query(
                `SELECT s.estado, p.pantallas, p.calidad 
                 FROM suscripciones s
                 INNER JOIN planes p ON s.plan_id = p.id
                 WHERE s.usuario_id = ? AND s.estado = 'activa'
                 ORDER BY s.id DESC LIMIT 1`,
                [usuario_id],
                (error, suscripcion) => {
                    if (error || suscripcion.length === 0) {
                        return res.json({ ok: false, mensaje: "No tienes una suscripción activa." });
                    }

                    const limites = suscripcion[0];
                    // Aseguramos que sea un número real, por si la BD devuelve un texto
                    const maxPantallas = parseInt(limites.pantallas) || 1; 

                    conexion.query(
                        "SELECT dispositivo_token FROM reproducciones_activas WHERE usuario_id = ?",
                        [usuario_id],
                        (errContador, activas) => {
                            if (errContador) return res.json({ ok: false, mensaje: "Error de servidor." });

                            const yaEstaReproduciendo = activas.some(a => a.dispositivo_token === dispositivo_token);

                            // Validamos contra el número real de pantallas de su plan (1, 2 o 4)
                            if (activas.length >= maxPantallas && !yaEstaReproduciendo) {
                                return res.json({ 
                                    ok: false, 
                                    limiteExcedido: true,
                                    mensaje: `Tu plan actual solo permite ${maxPantallas} pantalla(s) en simultáneo. Cierra otra ventana.` 
                                });
                            }

                            conexion.query(
                                `INSERT INTO reproducciones_activas (usuario_id, dispositivo_token, ultima_actividad) 
                                 VALUES (?, ?, NOW()) 
                                 ON DUPLICATE KEY UPDATE ultima_actividad = NOW()`,
                                [usuario_id, dispositivo_token],
                                (errInsert) => {
                                    if (errInsert) return res.json({ ok: false, mensaje: "Error al registrar pantalla." });
                                    
                                    res.json({ 
                                        ok: true, 
                                        calidad_maxima: limites.calidad,
                                        mensaje: "Streaming autorizado." 
                                    });
                                }
                            );
                        }
                    );
                }
            );
        }
    );
});

// 2. Ping constante para mantener el dispositivo "vivo"
app.post("/api/stream/ping", (req, res) => {
    const { usuario_id, dispositivo_token } = req.body;
    conexion.query(
        "UPDATE reproducciones_activas SET ultima_actividad = NOW() WHERE usuario_id = ? AND dispositivo_token = ?",
        [usuario_id, dispositivo_token],
        () => res.json({ ok: true })
    );
});

// 3. Quitar dispositivo al salir del reproductor
app.post("/api/stream/cerrar", (req, res) => {
    const { usuario_id, dispositivo_token } = req.body;
    conexion.query(
        "DELETE FROM reproducciones_activas WHERE usuario_id = ? AND dispositivo_token = ?",
        [usuario_id, dispositivo_token],
        () => res.json({ ok: true, mensaje: "Pantalla liberada." })
    );
});
/* =========================
   SERVIDOR lo pongo en comentario porque cambiare a vercel
========================= */

//const PORT = process.env.PORT || 3000;

//app.listen(PORT, () => {
//    console.log(`Servidor iniciado en puerto ${PORT}`);
//});
/* =========================================
   GENERAR RECIBO DE PAGO PARA DESCARGAR
========================================= */
app.get("/api/pagos/recibo/:pago_id", (req, res) => {
    const { pago_id } = req.params;

    const query = `
        SELECT p.monto, p.metodo_pago, p.fecha_pago, p.codigo_comprobante, 
               u.nombre as usuario_nombre, pl.nombre as plan_nombre
        FROM pagos p
        JOIN usuarios u ON p.usuario_id = u.id
        JOIN planes pl ON p.plan_id = pl.id
        WHERE p.id = ?
    `;

    conexion.query(query, [pago_id], (err, resultados) => {
        if (err || resultados.length === 0) return res.status(404).send("Recibo no encontrado");

        const pago = resultados[0];
        const fechaFormat = new Date(pago.fecha_pago).toLocaleDateString('es-PE');

        // Generamos un HTML limpio listo para imprimir
        const htmlRecibo = `
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <title>Recibo ${pago.codigo_comprobante}</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
                    .recibo-container { max-width: 600px; margin: 0 auto; border: 1px solid #ddd; padding: 30px; border-radius: 8px; }
                    .header { border-bottom: 2px solid #e50914; padding-bottom: 10px; margin-bottom: 20px; }
                    .header h1 { color: #e50914; margin: 0; }
                    .row { display: flex; justify-content: space-between; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
                    .total { font-size: 20px; font-weight: bold; color: #e50914; }
                </style>
            </head>
            <body onload="window.print()">
                <div class="recibo-container">
                    <div class="header">
                        <h1>STARVIEW</h1>
                        <p>Comprobante de Pago Electrónico</p>
                    </div>
                    <div class="row"><span>Cliente:</span> <strong>${pago.usuario_nombre}</strong></div>
                    <div class="row"><span>Código de Boleta:</span> <strong>${pago.codigo_comprobante}</strong></div>
                    <div class="row"><span>Fecha:</span> <strong>${fechaFormat}</strong></div>
                    <div class="row"><span>Plan Contratado:</span> <strong>Plan ${pago.plan_nombre}</strong></div>
                    <div class="row"><span>Método de Pago:</span> <strong>${pago.metodo_pago}</strong></div>
                    <div class="row total"><span>TOTAL PAGADO:</span> <span>S/ ${Number(pago.monto).toFixed(2)}</span></div>
                </div>
            </body>
            </html>
        `;
        res.send(htmlRecibo);
    });
});
/* =========================================
   CANCELAR SUSCRIPCIÓN (BLINDAJE DE TESIS)
========================================= */
app.post("/api/suscripciones/cancelar", (req, res) => {
    const { usuario_id, motivo } = req.body;

    // 1. Buscamos la fecha de fin para decirle al usuario hasta cuándo tiene acceso
    conexion.query("SELECT fecha_fin FROM suscripciones WHERE usuario_id = ? AND estado = 'activa' ORDER BY id DESC LIMIT 1", [usuario_id], (err, resultados) => {
        if (err || resultados.length === 0) return res.json({ ok: false, mensaje: "No tienes un plan activo para cancelar." });
        
        const fechaFin = new Date(resultados[0].fecha_fin).toLocaleDateString('es-PE');

        // 2. Actualizamos la BD: Apagamos la renovación, pero el estado SIGUE SIENDO 'activa'
        const queryUpdate = `
            UPDATE suscripciones 
            SET renovacion_automatica = 0, 
                fecha_cancelacion = NOW(),
                motivo_cancelacion = ?
            WHERE usuario_id = ? AND estado = 'activa'
        `;
        
        conexion.query(queryUpdate, [motivo || "Decisión del usuario", usuario_id], (errUpdate) => {
            if (errUpdate) return res.json({ ok: false, mensaje: "Error interno al cancelar." });
            
            res.json({ 
                ok: true, 
                mensaje: `Tu plan ha sido cancelado. No se te harán más cobros, pero podrás seguir disfrutando del contenido hasta el ${fechaFin}.` 
            });
        });
    });
});
module.exports = app;