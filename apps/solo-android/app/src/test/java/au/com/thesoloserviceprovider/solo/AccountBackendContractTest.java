package au.com.thesoloserviceprovider.solo;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assume.assumeTrue;

import org.junit.Test;

/**
 * Runs the app's AccountApi against running solo-auth / solo-report handlers.
 * Skipped unless SOLO_BACKEND_ACCOUNT_URL (a .../api/solo-chat URL on that server) is set.
 */
public class AccountBackendContractTest {
  @Test public void signInStatusReportRefreshAndLogout() {
    String url = System.getProperty("SOLO_BACKEND_ACCOUNT_URL");
    assumeTrue(url != null);
    AccountApi api = new AccountApi(url, "SOLOAI-Android/test");

    AccountApi.Status before = api.status(null);
    assertTrue(before.enabled);
    assertFalse(before.authenticated);

    AccountApi.SignIn wrong = api.login("pilot@example.test", "wrong password");
    assertFalse(wrong.ok());
    assertEquals(401, wrong.status.httpStatus);

    AccountApi.SignIn signIn = api.login("pilot@example.test", "correct horse battery");
    assertTrue(signIn.status.error, signIn.ok());
    assertTrue(signIn.status.authenticated);

    AccountApi.Status after = api.status(signIn.accessToken);
    assertTrue(after.authenticated);
    assertEquals("pilot@example.test", after.email);

    AccountApi.Report report = api.report(signIn.accessToken, "3f9e2b1a-4c5d-4e6f-8a7b-9c0d1e2f3a4b",
        "misleading", "Wrong facts", "A reply the customer received.");
    assertTrue(report.message, report.ok);

    AccountApi.Report invalid = api.report(signIn.accessToken, "not-a-uuid", "misleading", null, "x");
    assertFalse(invalid.ok);
    assertEquals(400, invalid.httpStatus);

    AccountApi.SignIn refreshed = api.refresh(signIn.refreshToken);
    assertTrue(refreshed.status.error, refreshed.ok());

    assertTrue(api.logout(refreshed.accessToken, refreshed.refreshToken));
  }
}
