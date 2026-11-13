package au.com.thesoloserviceprovider.solo;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.SystemClock;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Holds the customer session. The access token lives in memory only. The refresh token
 * is encrypted with a non-exportable Android Keystore AES-GCM key before being written to
 * private app storage, which is excluded from backup and device transfer.
 */
final class SessionStore {
  /** Encrypts small strings. Replaceable in JVM tests, where Android Keystore is absent. */
  interface Crypto {
    String encrypt(String plain) throws Exception;
    String decrypt(String sealed) throws Exception;
  }

  private static final String PREFS = "solo_session";
  /** Test-only override of the storage name, so each test starts signed out; null in the app. */
  static volatile String prefsNameOverride;
  private static final String KEY_REFRESH = "refresh";
  private static final String KEY_EMAIL = "email";
  /** Test-only override; always null in the shipped app. */
  static volatile Crypto cryptoOverride;

  private final SharedPreferences prefs;
  private final Crypto crypto;
  private volatile String accessToken;
  private volatile long accessExpiresAt;
  /** Increases on every sign-out, so a refresh that finishes afterwards can't restore the session. */
  private volatile long epoch;

  SessionStore(Context context) {
    prefs = context.getSharedPreferences(prefsNameOverride != null ? prefsNameOverride : PREFS, Context.MODE_PRIVATE);
    crypto = cryptoOverride != null ? cryptoOverride : new KeystoreCrypto();
  }

  /** The access token, or null when signed out or within a minute of expiry. */
  String accessToken() {
    String token = accessToken;
    return token != null && SystemClock.elapsedRealtime() < accessExpiresAt ? token : null;
  }

  long epoch() {
    return epoch;
  }

  /** Saves a refreshed session only if nobody signed out since {@code expectedEpoch} was read. */
  synchronized boolean saveIfCurrent(long expectedEpoch, String access, String refresh, int expiresInSeconds, String email) {
    if (epoch != expectedEpoch) return false;
    save(access, refresh, expiresInSeconds, email);
    return true;
  }

  synchronized void clearIfCurrent(long expectedEpoch) {
    if (epoch == expectedEpoch) clear();
  }

  synchronized void save(String access, String refresh, int expiresInSeconds, String email) {
    accessToken = access;
    accessExpiresAt = SystemClock.elapsedRealtime() + Math.max(0, expiresInSeconds - 60) * 1000L;
    try {
      SharedPreferences.Editor editor = prefs.edit().putString(KEY_REFRESH, crypto.encrypt(refresh));
      if (email != null) editor.putString(KEY_EMAIL, email);
      editor.commit();
    } catch (Exception e) {
      // If the token can't be stored securely, keep the session in memory only.
      prefs.edit().remove(KEY_REFRESH).commit();
    }
  }

  /** Forgets the access token (e.g. after the server rejects it), keeping the refresh token. */
  void invalidateAccess() {
    accessToken = null;
    accessExpiresAt = 0;
  }

  synchronized String refreshToken() {
    String sealed = prefs.getString(KEY_REFRESH, null);
    if (sealed == null) return null;
    try {
      return crypto.decrypt(sealed);
    } catch (android.security.keystore.KeyPermanentlyInvalidatedException
        | javax.crypto.AEADBadTagException | IllegalArgumentException | StringIndexOutOfBoundsException e) {
      // The key is gone or the stored value is corrupt: the session can never be read again.
      clear();
      return null;
    } catch (Exception e) {
      // A temporary Keystore failure: keep the session and try again later.
      return null;
    }
  }

  String email() {
    return prefs.getString(KEY_EMAIL, null);
  }

  boolean hasSession() {
    return accessToken() != null || prefs.contains(KEY_REFRESH);
  }

  synchronized void clear() {
    epoch++;
    accessToken = null;
    accessExpiresAt = 0;
    prefs.edit().clear().commit();
  }

  /** AES-256-GCM with a non-exportable key held by Android Keystore. */
  static final class KeystoreCrypto implements Crypto {
    private static final String ALIAS = "solo_session_v1";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";

    private SecretKey key() throws Exception {
      KeyStore store = KeyStore.getInstance("AndroidKeyStore");
      store.load(null);
      if (store.containsAlias(ALIAS)) return ((KeyStore.SecretKeyEntry) store.getEntry(ALIAS, null)).getSecretKey();
      KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
      generator.init(new KeyGenParameterSpec.Builder(ALIAS,
          KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
          .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
          .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
          .setKeySize(256)
          .build());
      return generator.generateKey();
    }

    @Override public String encrypt(String plain) throws Exception {
      Cipher cipher = Cipher.getInstance(TRANSFORMATION);
      cipher.init(Cipher.ENCRYPT_MODE, key());
      byte[] iv = cipher.getIV();
      byte[] data = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
      return Base64.encodeToString(iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(data, Base64.NO_WRAP);
    }

    @Override public String decrypt(String sealed) throws Exception {
      int split = sealed.indexOf(':');
      byte[] iv = Base64.decode(sealed.substring(0, split), Base64.NO_WRAP);
      byte[] data = Base64.decode(sealed.substring(split + 1), Base64.NO_WRAP);
      Cipher cipher = Cipher.getInstance(TRANSFORMATION);
      cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, iv));
      return new String(cipher.doFinal(data), StandardCharsets.UTF_8);
    }
  }
}
