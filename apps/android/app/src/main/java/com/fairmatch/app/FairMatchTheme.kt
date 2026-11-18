package com.fairmatch.app

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Ink = Color(0xFF291533)
private val Clay = Color(0xFFDC6E5D)
private val Signal = Color(0xFFD7F95B)
private val Canvas = Color(0xFFFCF8F0)
private val Sage = Color(0xFF45746A)

private val LightScheme = lightColorScheme(
    primary = Ink,
    onPrimary = Canvas,
    secondary = Clay,
    tertiary = Sage,
    background = Canvas,
    surface = Color(0xFFFFFDF8),
    onBackground = Ink,
    onSurface = Ink,
)

private val DarkScheme = darkColorScheme(
    primary = Signal,
    onPrimary = Ink,
    secondary = Color(0xFFFFAD9C),
    tertiary = Color(0xFF8FCABD),
    background = Ink,
    surface = Color(0xFF382140),
)

@Composable
fun FairMatchTheme(
    darkTheme: Boolean = false,
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkScheme else LightScheme,
        typography = FairMatchTypography,
        content = content,
    )
}
