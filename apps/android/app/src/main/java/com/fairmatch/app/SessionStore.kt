package com.fairmatch.app

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/** Stores only session tokens; password and database credentials are never stored on-device. */
class SessionStore(context: Context) {
    private val preferences = EncryptedSharedPreferences.create(
        context,
        "fairmatch.session",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    fun save(payload: AuthPayload) = preferences.edit()
        .putString("access_token", payload.accessToken)
        .putString("refresh_token", payload.refreshToken)
        .apply()

    fun accessToken(): String? = preferences.getString("access_token", null)
    fun clear() = preferences.edit().clear().apply()
}
