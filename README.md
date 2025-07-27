[![npm version](https://img.shields.io/npm/v/discord-voice-client)](https://www.npmjs.com/package/discord-voice-client)
[![license](https://img.shields.io/npm/l/discord-voice-client)](./LICENSE)
[![downloads](https://img.shields.io/npm/dt/discord-voice-client.svg)](https://www.npmjs.com/package/discord-voice-client)

# Discord voice client
- Работает на любых библиотеках такие как discord.js, seyfert, eris...
- Нет поддержки плеера, но готовая реализация есть [тут](https://github.com/SNIPPIK/UnTitles)

# 🎧 Основные возможности
#### 🔊 Голосовой движок
- Реализация [Voice Gateway Version 8](https://discord.com/developers/docs/topics/voice-connections) [`(WebSocket + UDP + SRTP + Opus + Sodium)`](src/services/voice) + [End-to-End Encryption (DAVE Protocol)](https://discord.com/developers/docs/topics/voice-connections#endtoend-encryption-dave-protocol)
- Полная реализация **SRTP**: `aead_aes256_gcm`, `xchacha20_poly1305` (через библиотеки)
- Адаптивная система отправки пакетов, без полноценного **WebRTP** ничего толкового не сделать!
- Работает с готовыми **Ogg/Opus** фреймами!
- Требуется **FFmpeg**, он отвечает за аудио!
- Работает даже при сильном **event loop lag**
#### 🎵 Аудио
- Есть свой парсер **Ogg/Opus** для получения чистого opus!
- Есть возможность переиспользовать аудио без конвертации
- Есть поддержка длинных видео, Live видео пока сыровато.

> [!WARNING]
> Это компонент из другого проекта [UnTitles](https://github.com/SNIPPIK/UnTitles), данный модуль предоставляется как есть!

> [!TIP]
> Вам потребуется AudioPlayer!!! Без него отправка аудио фреймов будет затруднительна  
> Рекомендуется отправлять аудио фреймы через 20 ms от прошло фрейма


## 📦 Установка
```bash
npm install discord-voice-client
```

## Discord.js
```ts
import { BufferedAudioResource, PipeAudioResource, VoiceConnection } from "discord-voice-client";
import { TaskCycle } from "snpk-cycle";

// Проще из-за нативной поддержки adapters
const adapter = message.guild.voiceAdapterCreator;
const config = {
    self_deaf: true,
    self_mute: false,
    guild_id: guild.id,
    channel_id: message.voice.channel.id
};

// Голосовое подключение готово
const voice = new VoiceConnection(config, adapter);

// Debug
voice.websocket.on("debug", console.log);
voice.websocket.on("warn", console.log);

// Буферезированный аудио поток
const bufferedAudio = new BufferedAudioResource("urlOrPathFile", {seek: 10, filters: null});

// Прямой аудио поток из ffmpeg с буфером в 14 сек
const pipeAudio = new PipeAudioResource("urlOrPathFile", {seek: 10, filters: null});

// Как отправлять циклично пакеты
class Sender<T extends VoiceConnection> extends TaskCycle<T> {
    public constructor() {
        super({
            // Время до следующего прогона цикла
            duration: 20,
            
            drift: false,

            // Функция проверки
            filter: (item) => item.ready,

            // Функция отправки аудио фрейма
            execute: (connection) => {
                connection.packet = audio.packet
            }
        });
    };
};

// Отправка пакетов
voice.packet = audio.packet;
```



## Seyfert
- Реализация voiceAdapterCreator
```ts
import {GatewayVoiceServerUpdateDispatchData, GatewayVoiceStateUpdateDispatchData} from "discord-api-types/v10";
import {DiscordClient} from "../client"; // Класс вашего клиента

/**
 * @description Класс для взаимодействия с клиентским websocket'ом
 * @class VoiceManager
 */
export class VoiceManager<Client extends DiscordClient> {
    /**
     * @description Коллекция адаптеров для общения голоса с клиентским websocket'ом
     * @readonly
     * @private
     */
    public readonly adapters = new Map<string, DiscordGatewayAdapterLibraryMethods>();

    /**
     * @description Копия клиента
     * @private
     */
    private client: Client;

    /**
     * @description ID осколка
     * @private
     */
    private shardID: number;

    /**
     * @description Создание класса
     * @param client - Класс клиента
     */
    public constructor(client: Client) {
        this.client = client;
    };

    /**
     * @description Адаптер состояния голоса для этой гильдии, который можно использовать с `@discordjs/voice` для воспроизведения звука в голосовых и сценических каналах.
     * @public
     */
    public voiceAdapterCreator = (guildID: string): DiscordGatewayAdapterCreator => {
        // Если нет ID осколка
        if (!this.shardID) this.shardID = this.client.gateway.calculateShardId(guildID);

        return methods => {
            this.adapters.set(guildID, methods);

            return {
                sendPayload: (data) => {
                    this.client.gateway.send(this.shardID, data);
                    return true;
                },
                destroy: () => {
                    this.adapters.delete(guildID);
                }
            };
        };
    };

    /**
     * @description Функция обновления данных о подключении к голосовому каналу
     * @param payload - Данные голосового состояния
     */
    public onVoiceServer = (payload: GatewayVoiceServerUpdateDispatchData) => {
        this.adapters.get(payload.guild_id)?.onVoiceServerUpdate(payload);
    };

    /**
     * @description Функция обновления данных о текущем голосовом состоянии
     * @param payload - Данные голосового состояния
     */
    public onVoiceStateUpdate = (payload: GatewayVoiceStateUpdateDispatchData) => {
        this.adapters.get(payload.guild_id)?.onVoiceStateUpdate(payload);
    };
}

/**
 * @description Шлюз Discord Адаптер, шлюза Discord.
 * @interface DiscordGatewayAdapterLibraryMethods
 */
export interface DiscordGatewayAdapterLibraryMethods {
    /**
     * @description Call this when the adapter can no longer be used (e.g. due to a disconnect from the main gateway)
     */
    destroy(): void;
    /**
     * @description Call this when you receive a VOICE_SERVER_UPDATE payload that is relevant to the adapter.
     * @param data - The inner data of the VOICE_SERVER_UPDATE payload
     */
    onVoiceServerUpdate(data: GatewayVoiceServerUpdateDispatchData): void;
    /**
     * @description Call this when you receive a VOICE_STATE_UPDATE payload that is relevant to the adapter.
     * @param data - The inner data of the VOICE_STATE_UPDATE payload
     */
    onVoiceStateUpdate(data: GatewayVoiceStateUpdateDispatchData): void;
}

/**
 * @description Методы, предоставляемые разработчиком адаптера Discord Gateway для DiscordGatewayAdapter.
 * @interface DiscordGatewayAdapterImplementerMethods
 */
export interface DiscordGatewayAdapterImplementerMethods {
    /**
     * @description Это будет вызвано voice, когда адаптер можно будет безопасно уничтожить, поскольку он больше не будет использоваться.
     */
    destroy(): void;
    /**
     * @description Реализуйте этот метод таким образом, чтобы данная полезная нагрузка отправлялась на основное соединение Discord gateway.
     * @param payload - Полезная нагрузка для отправки на основное соединение Discord gateway
     * @returns `false`, если полезная нагрузка определенно не была отправлена - в этом случае голосовое соединение отключается
     */
    sendPayload(payload: any): boolean;
}

/**
 * Функция, используемая для создания адаптеров. Она принимает параметр methods, содержащий функции, которые
 * могут быть вызваны разработчиком при получении новых данных по его шлюзовому соединению. В свою очередь,
 * разработчик вернет некоторые методы, которые может вызывать библиотека - например, для отправки сообщений на
 * шлюз или для подачи сигнала о том, что адаптер может быть удален.
 * @type DiscordGatewayAdapterCreator
 */
export type DiscordGatewayAdapterCreator = ( methods: DiscordGatewayAdapterLibraryMethods) => DiscordGatewayAdapterImplementerMethods;
```

- Как использовать реализацию voiceAdapterCreator
```ts
/**
 * @description Реализация клиента discord
 * @class DiscordClient
 */
export class DiscordClient extends Client {
    /**
     * @description Класс для общения с websocket
     * @public
     */
    public voice = new VoiceManager(this);
    //...
}

// Создадим события для отправки данных в adapter
import { createEvent } from 'seyfert';

// VOICE_SERVER_UPDATE
export default createEvent({
    data: { name: 'voiceServerUpdate' },
    async run(packet, client) {
        // Отправляем данные в adapter
        return client.voice.onVoiceServer({ ...packet, guild_id: packet.guildId });
    }
});

// VOICE_STATE_UPDATE
export default createEvent({
    data: { name: 'voiceStateUpdate' },
    async run(state, client) {
        const payload = state[0];

        // Если нет данных
        if (!payload) return;

        // Отправляем данные в adapter
        client.voice.onVoiceStateUpdate({
            session_id: payload.sessionId,
            channel_id: payload.channelId,
            guild_id: payload.guildId,
            user_id: payload.userId,

            self_stream: payload.selfStream,
            self_video: payload.selfVideo,
            self_mute: payload.selfMute,
            self_deaf: payload.selfDeaf,
            request_to_speak_timestamp: payload.requestToSpeakTimestamp,

            deaf: payload.deaf,
            mute: payload.mute,
            suppress: payload.suppress,
            member: null
        });
    }
});
```

- Вот теперь можно отправлять пакеты под seyfert
```ts
import { BufferedAudioResource, PipeAudioResource, VoiceConnection, SyncCycle } from "discord-voice-client";
import { TaskCycle } from "snpk-cycle";

const adapter = client.voice.voiceAdapterCreator(guild.id);
const config = {
    self_deaf: true,
    self_mute: false,
    guild_id: ctx.guildId,
    channel_id: ctx.member.voice("cache").id
};

// Голосовое подключение готово
const voice = new VoiceConnection(config, adapter);

// Буферезированный аудио поток
const bufferedAudio = new BufferedAudioResource("urlOrPathFile", {seek: 10, filters: null});

// Прямой аудио поток из ffmpeg с буфером в 14 сек
const pipeAudio = new PipeAudioResource("urlOrPathFile", {seek: 10, filters: null});

// Как отправлять циклично пакеты
class Sender<T extends VoiceConnection> extends TaskCycle<T> {
    public constructor() {
        super({
            // Время до следующего прогона цикла
            duration: 20,

            drift: false,

            // Функция проверки
            filter: (item) => item.ready,

            // Функция отправки аудио фрейма
            execute: (connection) => {
                
                // Отправка пакетов
                connection.packet = audio.packet
            }
        });
    };
};
```