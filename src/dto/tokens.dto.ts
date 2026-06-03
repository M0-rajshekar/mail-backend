import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsNotEmpty } from 'class-validator';
import { sirenType } from 'src/utils/siren.consumer';

export class TokensDto {
    @IsString()
    @IsNotEmpty()
    @ApiProperty({
        description: 'Unique identifier for the user',
        example: 'cma6hvbcc0000vhmklgs4ndfl',
        required: true,
    })
    userId: string;

    @IsString()
    @IsNotEmpty()
    @ApiProperty({
        description: 'Model used for the tokens',
        example: 'gpt-3.5-turbo',
        required: true,
    })
    model: string;

    @IsString()
    @IsNotEmpty()
    @ApiProperty({
        description: 'type of event',
        example: 'siren-image',
        required: true,
    })
    type: sirenType;

    @IsNumber()
    @IsNotEmpty()
    @ApiProperty({
        description: 'number of tokens',
        example: 100,
        required: true,
    })
    tokens: number;

    @IsNumber()
    @IsOptional()
    @ApiProperty({
        description: 'number of input tokens',
        example: 100,
        required: false,
    })
    input_tokens?: number;

    @IsNumber()
    @IsOptional()
    @ApiProperty({
        description: 'number of output tokens',
        example: 100,
        required: false,
    })
    output_tokens?: number;
}
