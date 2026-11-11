package au.com.thesoloserviceprovider.solo;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/** Minimal HTTP/1.1 server for JVM unit tests; one fixed response per request. */
final class TinyHttpServer implements AutoCloseable {
  volatile String lastBody;
  final Map<String, String> lastHeaders = new HashMap<>();
  private final ServerSocket socket;
  private final Thread thread;

  TinyHttpServer(int status, String contentType, String responseBody) throws IOException {
    socket = new ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"));
    thread = new Thread(() -> {
      while (!socket.isClosed()) {
        try (Socket client = socket.accept()) {
          handle(client, status, contentType, responseBody);
        } catch (IOException ignored) {
          // Closed during shutdown.
        }
      }
    });
    thread.setDaemon(true);
    thread.start();
  }

  int port() { return socket.getLocalPort(); }

  private void handle(Socket client, int status, String type, String body) throws IOException {
    InputStream in = new BufferedInputStream(client.getInputStream());
    synchronized (lastHeaders) { lastHeaders.clear(); }
    String line = readLine(in); // request line
    int length = 0;
    while (!(line = readLine(in)).isEmpty()) {
      int colon = line.indexOf(':');
      if (colon <= 0) continue;
      String name = line.substring(0, colon).trim().toLowerCase(Locale.ROOT);
      String value = line.substring(colon + 1).trim();
      synchronized (lastHeaders) { lastHeaders.put(name, value); }
      if (name.equals("content-length")) length = Integer.parseInt(value);
    }
    byte[] data = new byte[length];
    int read = 0;
    while (read < length) {
      int n = in.read(data, read, length - read);
      if (n < 0) break;
      read += n;
    }
    lastBody = new String(data, 0, read, StandardCharsets.UTF_8);
    byte[] out = body.getBytes(StandardCharsets.UTF_8);
    String head = "HTTP/1.1 " + status + " X\r\nContent-Type: " + type + "\r\nContent-Length: "
        + out.length + "\r\nConnection: close\r\n\r\n";
    OutputStream os = client.getOutputStream();
    os.write(head.getBytes(StandardCharsets.US_ASCII));
    os.write(out);
    os.flush();
  }

  private static String readLine(InputStream in) throws IOException {
    ByteArrayOutputStream b = new ByteArrayOutputStream();
    int c;
    while ((c = in.read()) != -1 && c != '\n') if (c != '\r') b.write(c);
    return b.toString(StandardCharsets.US_ASCII.name());
  }

  String header(String name) {
    synchronized (lastHeaders) { return lastHeaders.get(name.toLowerCase(Locale.ROOT)); }
  }

  @Override public void close() throws IOException { socket.close(); }
}
