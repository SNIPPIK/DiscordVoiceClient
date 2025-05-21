# Discord voice client
- Работает на следующих библиотеках (discord.js, seyfert)


## Discord.js

```ts
import {AudioResource, VoiceConnection} from "discord-voice-client";

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

// Отправка пакетов
voice.packet = Buffer;
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

- Как использовать реализация voiceAdapterCreator
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

- Вот теперь можно отправлять пакеты в seyfert
```ts
import {AudioResource, VoiceConnection} from "discord-voice-client";

const adapter = client.voice.voiceAdapterCreator(guild.id);
const config = {
    self_deaf: true,
    self_mute: false,
    guild_id: ctx.guildId,
    channel_id: ctx.member.voice("cache").id
};

// Голосовое подключение готово
const voice = new VoiceConnection(config, adapter);

// Отправка пакетов
voice.packet = Buffer;
```