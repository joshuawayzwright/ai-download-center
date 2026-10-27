package au.com.thesoloserviceprovider.solo;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.net.Uri;
import android.graphics.Color;
import android.view.View;
import android.widget.*;
import org.json.JSONArray;
import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.OutputStream;
import java.io.BufferedReader;
import java.io.InputStreamReader;

public final class MainActivity extends Activity {
  private static final String API = "https://thesoloserviceprovider.com.au/api/solo-chat";
  private static final int GOLD = Color.rgb(201,162,83);
  private static final int BG = Color.rgb(11,14,17);
  private LinearLayout messages;
  private EditText input;
  private Button send;
  private final JSONArray history = new JSONArray();

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    LinearLayout page = new LinearLayout(this);
    page.setOrientation(LinearLayout.VERTICAL);
    page.setPadding(24,30,24,24);
    page.setBackgroundColor(BG);
    TextView title = label("SOLO AI",26,GOLD);
    page.addView(title);
    page.addView(label("One AI. Endless Possibilities.",14,Color.LTGRAY));
    ScrollView scroll = new ScrollView(this);
    messages = new LinearLayout(this);
    messages.setOrientation(LinearLayout.VERTICAL);
    scroll.addView(messages);
    page.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
    addMessage("SOLO", "Welcome. Explore the AI Hub or ask about apps, products and services.");
    LinearLayout row = new LinearLayout(this);
    input = new EditText(this);
    input.setSingleLine(false);
    input.setMaxLines(3);
    input.setHint("Ask SOLO...");
    input.setTextColor(Color.WHITE);
    input.setHintTextColor(Color.GRAY);
    row.addView(input,new LinearLayout.LayoutParams(0,-2,1));
    send = new Button(this);
    send.setText("Send");
    row.addView(send);
    page.addView(row);
    Button hub = new Button(this);
    hub.setText("Explore AI Download Centre");
    hub.setOnClickListener(v -> open("https://joshuawayzwright.github.io/ai-download-center/"));
    page.addView(hub);
    Button suite = new Button(this);
    suite.setText("Open SOLO Business Tools (preview)");
    suite.setOnClickListener(v -> open("https://solo-ai-business-command.vercel.app/"));
    page.addView(suite);
    TextView note = label("Preview client. Live AI requires a configured, protected server API. Never enter payment or private details.",12,Color.LTGRAY);
    page.addView(note);
    setContentView(page);
    send.setOnClickListener(v -> ask());
  }
  private TextView label(String value,int size,int color){
    TextView t = new TextView(this);
    t.setText(value); t.setTextSize(size); t.setTextColor(color);
    t.setPadding(0,8,0,8);
    return t;
  }
  private void addMessage(String who,String body){
    messages.addView(label(who+": "+body,16,who.equals("SOLO")?GOLD:Color.WHITE));
  }
  private void open(String url){
    startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));
  }
  private void ask(){
    String q=input.getText().toString().trim();
    if(q.isEmpty()||q.length()>400)return;
    input.setText("");
    addMessage("You",q);
    send.setEnabled(false);
    new Thread(() -> {
      String answer;
      try {
        JSONObject user = new JSONObject().put("role","user").put("content",q);
        JSONArray outgoing = new JSONArray();
        int start=Math.max(0,history.length()-8);
        for(int i=start;i<history.length();i++)outgoing.put(history.get(i));
        outgoing.put(user);
        HttpURLConnection c=(HttpURLConnection)new URL(API).openConnection();
        c.setRequestMethod("POST");
        c.setConnectTimeout(9000); c.setReadTimeout(18000);
        c.setDoOutput(true);
        c.setRequestProperty("Content-Type","application/json");
        byte[] payload=new JSONObject().put("messages",outgoing).toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
        try(OutputStream out=c.getOutputStream()){out.write(payload);}
        if(c.getResponseCode()!=200)throw new IllegalStateException("Service not active");
        StringBuilder response=new StringBuilder();
        try(BufferedReader reader=new BufferedReader(new InputStreamReader(c.getInputStream(),java.nio.charset.StandardCharsets.UTF_8))){
          String line;while((line=reader.readLine())!=null)response.append(line);
        }
        answer=new JSONObject(response.toString()).getString("answer");
        history.put(user);
        history.put(new JSONObject().put("role","assistant").put("content",answer));
        c.disconnect();
      } catch(Exception e) {
        answer="Live SOLO conversations are not available yet. Visit the AI Download Centre to explore AI tools, or contact superadmin2712@gmail.com.";
      }
      String result=answer;
      runOnUiThread(() -> {addMessage("SOLO",result);send.setEnabled(true);});
    }).start();
  }
}
