const API_BASE = window.location.origin;
const usuario_id = (localStorage.getItem("usuario_id") || sessionStorage.getItem("usuario_id"));

function cerrarSesion() {
    localStorage.clear(); sessionStorage.clear();
}

function protegerSesion() {
    if (!usuario_id) {
        window.location.href = "login.html";
        return false;
    }

    return true;
}

function fechaLocal(fecha) {
    if (!fecha) return "No definido";
    return new Date(fecha).toLocaleDateString();
}

async function cargarSuscripcion() {
    if (!protegerSesion()) return;

    const contenedor = document.getElementById("suscripcionCard");

    try {
        const respuesta = await fetch(`${API_BASE}/suscripcion/${usuario_id}`);
        const suscripcion = await respuesta.json();

        if (!suscripcion || !suscripcion.id) {
            contenedor.innerHTML = `
                <h2>No tienes una suscripción activa</h2>
                <p class="section-subtitle">Selecciona un plan para acceder al catálogo de StarView.</p>
                <a href="planes.html#seleccionar-plan" class="btn btn-primary">Seleccionar plan</a>
            `;
            return;
        }

        contenedor.innerHTML = `
            <h2>Plan ${suscripcion.plan}</h2>

            <div class="info-row">
                <span>Estado</span>
                <strong style="text-transform: capitalize;">${suscripcion.estado}</strong>
            </div>

            <div class="info-row">
                <span>Precio</span>
                <strong>S/ ${Number(suscripcion.precio).toFixed(2)}</strong>
            </div>

            <div class="info-row">
                <span>Fecha de inicio</span>
                <strong>${fechaLocal(suscripcion.fecha_inicio)}</strong>
            </div>

            <div class="info-row">
                <span>Tipo de plan</span>
                <strong>Prepago (30 Días)</strong>
            </div>

            <div class="info-row">
                <span>Acceso hasta</span>
                <strong>${suscripcion.fecha_fin ? fechaLocal(suscripcion.fecha_fin) : "Fin del mes pagado"}</strong>
            </div>

            ${suscripcion.estado === "activa" ? `
                <label for="motivoCancelacion">Motivo de cancelación</label>
                <textarea id="motivoCancelacion" placeholder="Escribe el motivo por el cual ya no deseas continuar"></textarea>

                <button class="btn btn-secondary btn-full" onclick="cancelarSuscripcion(${suscripcion.id})">
                    Cancelar suscripción
                </button>
            ` : `
                <div style="background: rgba(251, 191, 36, 0.1); padding: 15px; border-radius: 8px; border: 1px solid #fbbf24; text-align: center; margin-top: 20px;">
                    <p style="color: #fbbf24; margin: 0; font-weight: bold;">Suscripción cancelada</p>
                    <p style="color: #e2e8f0; font-size: 14px; margin: 5px 0 0 0;">Podrás seguir viendo contenido hasta tu fecha de caducidad.</p>
                </div>
            `}
        `;
    } catch (error) {
        contenedor.innerHTML = `
            <h2>No se pudo cargar la suscripción</h2>
            <p class="section-subtitle">Verifica que el servidor y MariaDB estén activos.</p>
        `;
    }
}

async function cancelarSuscripcion(id) {
    const motivo = document.getElementById("motivoCancelacion").value.trim();

    if (!motivo) {
        alert("Ingrese un motivo de cancelación");
        return;
    }

    const confirmar = confirm(
        "¿Estás seguro de cancelar tu suscripción? Mantendrás acceso hasta el fin del mes pagado."
    );

    if (!confirmar) return;

    try {
        // NOTA: Asegúrate de que esta URL coincida exactamente con la ruta de tu backend.
        // Si tu backend usa `/api/suscripciones/cancelar`, cámbiala aquí.
        const respuesta = await fetch(`${API_BASE}/suscripcion/cancelar/${id}`, {
            method: "PUT", // O "POST", según hayas definido en tu backend
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                usuario_id: usuario_id, // Enviamos también el usuario_id si tu backend lo requiere
                motivo_cancelacion: motivo
            })
        });

        const datos = await respuesta.json();
        
        // Modificación aquí para manejar si la respuesta fue exitosa o no
        if (respuesta.ok || datos.ok) {
            alert(datos.mensaje);
            // En vez de solo recargar la info, puedes recargar la página 
            // para que limpie el formulario y actualice el estado visualmente
            window.location.reload(); 
        } else {
            alert("Error: " + (datos.mensaje || "No se pudo procesar la cancelación."));
        }

    } catch (error) {
        console.error("Error al cancelar:", error);
        alert("No se pudo conectar con el servidor para cancelar la suscripción.");
    }
}
cargarSuscripcion();