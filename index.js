const WebSocket = require('ws');

// Crear servidor WebSocket en puerto 8080
const wss = new WebSocket.Server({ port: 8080 });

// Almacenar usuarios conectados
const usuarios = new Map(); // Mapa de nombres de usuario a conexiones WebSocket

// Manejar nueva conexión
wss.on('connection', (ws) => {
  console.log('Nueva conexión entrante');
  
  // Agregar ping/pong para mantener la conexión viva
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (data) => {
    try {
      const mensaje = JSON.parse(data);
      console.log('Mensaje recibido:', mensaje);
      
      switch(mensaje.tipo) {
        case 'registro':
          manejarRegistro(ws, mensaje);
          break;
          
        case 'solicitar_usuarios':
          console.log('Solicitud de usuarios recibida');
          enviarListaUsuarios(ws);
          break;
          
        case 'mensaje':
          enviarMensaje(ws, mensaje);
          break;
          
        default:
          enviarError(ws, 'Tipo de mensaje no válido');
      }
    } catch (error) {
      console.error('Error procesando mensaje:', error);
      enviarError(ws, 'Error procesando mensaje');
    }
  });

  ws.on('error', (error) => {
    console.error('Error en la conexión WebSocket:', error);
    // No cerrar inmediatamente, dejar que el ping/pong maneje la desconexión
  });

  ws.on('close', () => {
    // Eliminar usuario cuando se cierra la conexión
    for (let [nombre, conexion] of usuarios.entries()) {
      if (conexion === ws) {
        console.log(`Usuario ${nombre} desconectado`);
        usuarios.delete(nombre);
        break;
      }
    }
    // Solo notificar si realmente había un usuario registrado
    if (ws.nombreUsuario) {
      enviarListaUsuariosATodos();
      notificarActualizacion(`${ws.nombreUsuario} se ha desconectado`);
    }
  });
});

// Verificar conexiones cada 30 segundos
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log('Cerrando conexión inactiva');
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(interval);
});

function manejarRegistro(ws, mensaje) {
  console.log('Intentando registrar usuario:', mensaje.nombre);
  
  if (!mensaje.nombre || typeof mensaje.nombre !== 'string') {
    enviarError(ws, 'Nombre de usuario inválido');
    return;
  }
  
  if (usuarios.has(mensaje.nombre)) {
    console.log('Nombre de usuario ya existe:', mensaje.nombre);
    enviarError(ws, 'Nombre de usuario ya existe');
    return;
  }
  
  // Guardar el nombre de usuario en la conexión WebSocket
  ws.nombreUsuario = mensaje.nombre;
  usuarios.set(mensaje.nombre, ws);
  
  console.log('Usuario registrado:', mensaje.nombre);
  console.log('Usuarios conectados:', Array.from(usuarios.keys()));
  
  ws.send(JSON.stringify({
    tipo: 'registro',
    estado: 'exitoso',
    nombre: mensaje.nombre
  }));
  
  enviarListaUsuariosATodos();
  notificarActualizacion(`${mensaje.nombre} se ha conectado`);
}

function enviarListaUsuarios(ws) {
  if (!ws.nombreUsuario) {
    enviarError(ws, 'Usuario no registrado');
    return;
  }

  const listaUsuarios = Array.from(usuarios.keys())
    .filter(nombre => nombre !== ws.nombreUsuario);
  
  console.log('Enviando lista de usuarios a', ws.nombreUsuario, ':', listaUsuarios);
  
  ws.send(JSON.stringify({
    tipo: 'usuarios',
    usuarios: listaUsuarios.map(nombre => ({ nombre }))
  }));
}

function enviarListaUsuariosATodos() {
  console.log('Enviando lista actualizada a todos los usuarios');
  
  usuarios.forEach((conexion, nombreUsuario) => {
    if (conexion.readyState === WebSocket.OPEN) {
      const otrosUsuarios = Array.from(usuarios.keys())
        .filter(nombre => nombre !== nombreUsuario)
        .map(nombre => ({ nombre }));
      
      console.log('Enviando a', nombreUsuario, ':', otrosUsuarios);
      
      conexion.send(JSON.stringify({
        tipo: 'usuarios',
        usuarios: otrosUsuarios
      }));
    }
  });
}

function enviarMensaje(ws, mensaje) {
  const nombreRemitente = ws.nombreUsuario;

  if (!nombreRemitente) {
    enviarError(ws, 'Usuario no registrado');
    return;
  }

  // Verificar que no se envíe mensaje a sí mismo
  if (mensaje.destinatario === nombreRemitente) {
    enviarError(ws, 'No puedes enviarte mensajes a ti mismo');
    return;
  }

  const conexionDestinatario = usuarios.get(mensaje.destinatario);
  if (!conexionDestinatario || conexionDestinatario.readyState !== WebSocket.OPEN) {
    enviarError(ws, 'Usuario no encontrado o desconectado');
    return;
  }
  
  const timestamp = new Date().toISOString();
  const mensajeFormateado = {
    tipo: 'mensaje',
    remitente: nombreRemitente,
    destinatario: mensaje.destinatario,
    contenido: mensaje.contenido,
    timestamp: timestamp
  };

  // Enviar mensaje al destinatario
  conexionDestinatario.send(JSON.stringify(mensajeFormateado));

  // Enviar confirmación al remitente con el mismo formato
  ws.send(JSON.stringify(mensajeFormateado));
}

function enviarError(ws, mensaje) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      tipo: 'error',
      mensaje: mensaje
    }));
  }
}

function notificarActualizacion(mensaje) {
  for (let conexion of usuarios.values()) {
    if (conexion.readyState === WebSocket.OPEN) {
      conexion.send(JSON.stringify({
        tipo: 'actualizacion',
        mensaje: mensaje,
        timestamp: new Date().toISOString()
      }));
    }
  }
}

console.log('Servidor WebSocket iniciado en puerto 8080');
